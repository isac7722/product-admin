"""Business transactions shared by direct edits and Excel imports."""

from decimal import ROUND_CEILING, Decimal, localcontext

from fastapi import HTTPException

from app.dimensions import resolve_dimension
from app.models import Cost, Product, Rate, Sale, Shooting, Specification
from app.sizes import resolve_size
from app.storage import all_docs, get_doc, record_history, save_doc

MONEY_FIELDS = ["production_cost", "sale_price", "normal_price", "margin", "margin_rate", "status"]


def decimal_text(value: Decimal) -> str:
    """Serialize a finite exact decimal without exponent notation."""
    return format(value, "f")


def calculate(db, inputs: dict) -> dict:
    """Keep input products exact before the final repeating margin ratio."""
    with localcontext() as context:
        context.prec = 64
        return _calculate(db, inputs)


def _calculate(db, inputs: dict) -> dict:
    """Apply approved worksheet arithmetic without rounding intermediates."""
    missing = list(inputs.get("unresolved_inputs", []))
    details = []
    total = Decimal(0)
    for line in inputs.get("lines", []):
        rate = get_doc(db, "rates", line["rate_id"])
        if rate["category"] in {"택배비", "포장비"}:
            raise HTTPException(422, "택배·포장비는 원가 항목 대신 별도 비용으로 연결하세요.")
        loss = Decimal(line.get("loss_rate", "0"))
        if rate["category"] != "원단" and loss:
            raise HTTPException(422, "로스는 원단 항목에만 적용합니다.")
        if rate["amount"] is None:
            missing.append(f"{rate['name']} 단가 미입력")
            details.append({**line, "name": rate["name"], "amount": None})
            continue
        base = Decimal(rate["amount"]) * Decimal(line["quantity"])
        loss_amount = base * loss
        amount = (base + loss_amount) * (Decimal(1) if rate["vat_included"] else Decimal("1.1"))
        total += amount
        details.append(
            {
                **line,
                "name": rate["name"],
                "unit": rate["unit"],
                "category": rate["category"],
                "unit_price": rate["amount"],
                "vat_included": rate["vat_included"],
                "base": decimal_text(base),
                "loss_amount": decimal_text(loss_amount),
                "amount": decimal_text(amount),
            }
        )
    if not inputs.get("lines"):
        missing.append("원가 항목 미등록")
    production = None if missing else total
    charges = {}
    for key, category in (("shipping_rate_id", "택배비"), ("packaging_rate_id", "포장비")):
        rate_id = inputs.get(key)
        if not rate_id:
            missing.append(f"{category} 미연결")
            charges[category] = None
            continue
        rate = get_doc(db, "rates", rate_id)
        if rate["category"] != category:
            raise HTTPException(422, f"{category}에 해당하는 단가를 선택하세요.")
        if rate["amount"] is None:
            missing.append(f"{category} 미입력")
            charges[category] = None
        else:
            charges[category] = Decimal(rate["amount"]) * (Decimal(1) if rate["vat_included"] else Decimal("1.1"))
    price = Decimal(inputs["sale_price"]) if inputs.get("sale_price") is not None else None
    normal = (
        (price / Decimal("0.6") / 100).to_integral_value(rounding=ROUND_CEILING) * 100 if price is not None else None
    )
    result = {
        "production_cost": decimal_text(production) if production is not None else None,
        "normal_price": decimal_text(normal) if normal is not None else None,
        "margin": None,
        "margin_rate": None,
        "fee": None,
        "defect": None,
        "vat": None,
        "shipping": decimal_text(charges["택배비"]) if charges["택배비"] is not None else None,
        "packaging": decimal_text(charges["포장비"]) if charges["포장비"] is not None else None,
        "details": details,
    }
    if price is None:
        missing.append("상시할인가 미입력")
    if not missing:
        fee = price * Decimal("0.20")
        defect = price * Decimal("0.01")
        balance = price - production - fee - charges["택배비"] - charges["포장비"]
        vat = balance * Decimal("0.10")
        margin = balance - vat - defect
        result.update(
            fee=decimal_text(fee),
            defect=decimal_text(defect),
            vat=decimal_text(vat),
            margin=decimal_text(margin),
            margin_rate=decimal_text(margin / price) if price else None,
        )
        if not price:
            missing.append("상시할인가 0원: 마진율 계산 불가")
    return {**result, "status": "계산 확인 필요" if missing else "계산 완료", "issues": missing}


def save_product(db, payload: Product, identifier: str | None = None) -> dict:
    """Maintain one group prefix and unique physical variants atomically."""
    body = payload.model_dump(mode="json", exclude={"version"})
    products = all_docs(db, "products")
    old = get_doc(db, "products", identifier) if identifier else None
    size = resolve_size(db, body["size"], body["size_id"], old)
    body["size_id"] = size["id"]
    dimension = resolve_dimension(db, body["dimensions"], body["dimensions_id"], old)
    body["dimensions_id"] = dimension["id"] if dimension else None
    group = next(
        (
            g
            for g in all_docs(db, "groups")
            if g["design"] == body["design"] and g["product_type"] == body["product_type"]
        ),
        None,
    )
    if old:
        old_group = get_doc(db, "groups", old["group_id"])
        if group and group["id"] != old_group["id"]:
            raise HTTPException(409, "이미 존재하는 기술서로 이름을 변경할 수 없습니다.")
        group = old_group
    if not group:
        if any(g["prefix"] == body["prefix"] for g in all_docs(db, "groups")):
            raise HTTPException(409, "다른 디자인·종류에서 사용하는 prefix입니다.")
        group = save_doc(
            db,
            "groups",
            {
                "design": body["design"],
                "product_type": body["product_type"],
                "prefix": body["prefix"],
                "spec": Specification().model_dump(exclude={"version"}),
            },
        )
    group_id = group["id"]
    if any(g["prefix"] == body["prefix"] and g["id"] != group_id for g in all_docs(db, "groups")):
        raise HTTPException(409, "다른 디자인·종류에서 사용하는 prefix입니다.")
    if any(
        p["id"] != identifier
        and p["group_id"] == group_id
        and p["color"] == body["color"]
        and p["size"] == body["size"]
        for p in products
    ):
        raise HTTPException(409, "동일한 디자인·종류·색상·사이즈가 이미 있습니다.")
    if old and payload.version != old["version"]:
        raise HTTPException(409, {"message": "제품이 변경되었습니다.", "current": old})
    rename_color = old and old["color"] != body["color"]
    if rename_color and any(p["group_id"] == group_id and p["color"] == body["color"] for p in products):
        raise HTTPException(409, "해당 색상이 이미 있습니다. 기존 색상과 자동 병합하지 않습니다.")
    group_changed = any(group[k] != body[k] for k in ("prefix", "design", "product_type"))
    if group_changed:
        group = save_doc(
            db,
            "groups",
            {**group, **{k: body[k] for k in ("prefix", "design", "product_type")}},
            group_id,
            group["version"],
        )
    for sibling in products:
        if sibling["group_id"] != group_id or sibling["id"] == identifier:
            continue
        changed_color = rename_color and sibling["color"] == old["color"]
        if group_changed or changed_color:
            sibling_color = body["color"] if changed_color else sibling["color"]
            save_doc(
                db,
                "products",
                {
                    **sibling,
                    "prefix": body["prefix"],
                    "design": body["design"],
                    "product_type": body["product_type"],
                    "color": sibling_color,
                    "code": f"{body['prefix']}-{sibling_color}-{sibling['size']}",
                },
                sibling["id"],
                sibling["version"],
            )
    if rename_color:
        for kind in ("files", "shooting"):
            for linked in all_docs(db, kind):
                if linked.get("group_id") == group_id and linked.get("color") == old["color"]:
                    save_doc(db, kind, {**linked, "color": body["color"]}, linked["id"], linked["version"])
    body.update(group_id=group_id, code=f"{body['prefix']}-{body['color']}-{body['size']}")
    return save_doc(db, "products", body, identifier, payload.version)


def save_rate(db, payload: Rate, identifier: str | None = None, reason: str = "단가 수정") -> dict:
    """Recalculate affected products in the caller's transaction."""
    old = get_doc(db, "rates", identifier) if identifier else None
    body = payload.model_dump(mode="json", exclude={"version"})
    saved = save_doc(db, "rates", body, identifier, payload.version)
    if old:
        record_history(db, saved["id"], old, saved, ["amount", "vat_included"], reason)
        for cost in all_docs(db, "costs"):
            if rate_used(cost, saved["id"]):
                updated = {**cost, **calculate(db, cost)}
                save_doc(db, "costs", updated, cost["id"], cost["version"])
                record_history(db, cost["product_id"], cost, updated, MONEY_FIELDS, reason)
    return saved


def rate_used(cost: dict, identifier: str) -> bool:
    """Include shipping and packaging dependencies."""
    return identifier in [cost.get("shipping_rate_id"), cost.get("packaging_rate_id")] or any(
        line["rate_id"] == identifier for line in cost["lines"]
    )


def save_cost(db, product_id: str, payload: Cost, reason: str = "원가·판매가 수정") -> dict:
    """Save a single product's inputs and calculated snapshot."""
    get_doc(db, "products", product_id)
    old = next((c for c in all_docs(db, "costs") if c["product_id"] == product_id), None)
    if old and payload.version != old["version"]:
        raise HTTPException(409, {"message": "원가가 변경되었습니다.", "current": old})
    body = payload.model_dump(mode="json", exclude={"version"})
    body.update(product_id=product_id, **calculate(db, body))
    saved = save_doc(db, "costs", body, old["id"] if old else None, payload.version)
    if old:
        record_history(db, product_id, old, saved, MONEY_FIELDS, reason)
    return saved


def save_sale(db, payload: Sale, identifier: str | None = None) -> dict:
    """Validate item links and optional parent composition."""
    get_doc(db, "groups", payload.group_id)
    if identifier:
        children = [sale for sale in all_docs(db, "sales") if sale.get("parent_id") == identifier]
        if children and (
            payload.sale_type == "추가옵션"
            or any(child["group_id"] != payload.group_id or child["channel"] != payload.channel for child in children)
        ):
            raise HTTPException(422, "연결된 추가옵션이 있어 판매처·기술서·구성 유형을 변경할 수 없습니다.")
    for item in payload.items:
        get_doc(db, "products", item.product_id)
    if payload.sale_type == "단품" and (len(payload.items) != 1 or payload.items[0].quantity != 1):
        raise HTTPException(422, "단품은 제품 1개, 수량 1개로 구성하세요.")
    if payload.sale_type == "추가옵션":
        if not payload.parent_id or payload.parent_id == identifier:
            raise HTTPException(422, "추가옵션의 적용 판매구성을 선택하세요.")
        parent = get_doc(db, "sales", payload.parent_id)
        if (
            parent["group_id"] != payload.group_id
            or parent["channel"] != payload.channel
            or parent["sale_type"] == "추가옵션"
        ):
            raise HTTPException(422, "동일 기술서·판매처의 단품 또는 세트를 선택하세요.")
    elif payload.parent_id:
        raise HTTPException(422, "추가옵션에만 적용 구성을 연결할 수 있습니다.")
    return save_doc(db, "sales", payload.model_dump(mode="json", exclude={"version"}), identifier, payload.version)


def save_shooting(db, group_id: str, payload: Shooting) -> dict:
    """Save one shooting composition per group color."""
    get_doc(db, "groups", group_id)
    if not any(p["group_id"] == group_id and p["color"] == payload.color for p in all_docs(db, "products")):
        raise HTTPException(422, "기술서에 등록된 색상을 선택하세요.")
    for item in payload.items:
        if item.product_id:
            get_doc(db, "products", item.product_id)
    old = next((s for s in all_docs(db, "shooting") if s["group_id"] == group_id and s["color"] == payload.color), None)
    return save_doc(
        db,
        "shooting",
        {**payload.model_dump(mode="json", exclude={"version"}), "group_id": group_id},
        old["id"] if old else None,
        payload.version,
    )
