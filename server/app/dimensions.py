"""Managed optional dimensions with reviewed updates to linked products."""

import unicodedata
from sqlite3 import Connection

from fastapi import APIRouter, HTTPException
from pydantic import Field, field_validator

from app.models import Model
from app.storage import all_docs, get_doc, record_history, save_doc, transaction

router = APIRouter(prefix="/api/dimensions", tags=["dimensions"])


class Dimension(Model):
    """Editable dimension settings and the exact product versions reviewed for a rename."""

    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=240)
    sort_order: int = Field(default=0, ge=0, le=9999)
    active: bool = True
    product_versions: dict[str, int] | None = None

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        """Normalize labels while allowing units, multiplication signs, and ranges."""
        value = unicodedata.normalize("NFC", value).strip()
        if not value or any(unicodedata.category(c).startswith("C") for c in value):
            raise ValueError("상세 규격 이름은 비어 있거나 제어문자를 포함할 수 없습니다.")
        return value


def migrate_dimensions() -> None:
    """Link legacy products once without changing labels, codes, IDs, or other data."""
    with transaction() as db:
        dimensions = {s["name"]: s for s in all_docs(db, "dimensions")}
        for product in all_docs(db, "products"):
            if product.get("dimensions_id"):
                continue
            name = product.get("dimensions", "")
            if not name:
                continue
            if name not in dimensions:
                dimensions[name] = save_doc(
                    db, "dimensions", {"name": name, "description": "", "sort_order": len(dimensions), "active": True}
                )
            save_doc(
                db, "products", {**product, "dimensions_id": dimensions[name]["id"]}, product["id"], product["version"]
            )


def resolve_dimension(db: Connection, name: str, identifier: str | None, old: dict | None) -> dict | None:
    """Reject unregistered or inactive selections while allowing unchanged retired dimensions."""
    if not name:
        if identifier:
            raise HTTPException(422, "상세 규격 값과 선택 항목이 일치하지 않습니다.")
        return None
    dimension = (
        get_doc(db, "dimensions", identifier)
        if identifier
        else next((s for s in all_docs(db, "dimensions") if s["name"] == name), None)
    )
    if not dimension:
        raise HTTPException(
            422, f"등록되지 않은 상세 규격 '{name}'입니다. 설정에서 추가하거나 등록된 상세 규격을 선택하세요."
        )
    if dimension["name"] != name:
        raise HTTPException(409, "상세 규격 이름이 변경되었습니다. 목록을 새로고침하고 다시 선택하세요.")
    if not dimension["active"] and not (old and old.get("dimensions_id") == dimension["id"]):
        raise HTTPException(422, "사용 중지된 상세 규격입니다. 사용 중인 상세 규격을 선택하세요.")
    return dimension


def dimension_preview(db: Connection, identifier: str, payload: Dimension) -> dict:
    """Validate settings and return the complete set of affected product dimensions."""
    old = get_doc(db, "dimensions", identifier)
    if old["version"] != payload.version:
        raise HTTPException(
            409, {"message": "상세 규격 설정이 변경되었습니다. 새로고침 후 다시 확인하세요.", "current": old}
        )
    if any(
        s["id"] != identifier and s["name"].casefold() == payload.name.casefold() for s in all_docs(db, "dimensions")
    ):
        raise HTTPException(409, "이미 등록된 상세 규격 이름입니다. 사용 중지된 항목도 확인하세요.")
    products = all_docs(db, "products")
    affected = [p for p in products if p.get("dimensions_id") == identifier]
    changes = [
        {"id": p["id"], "version": p["version"], "code": p["code"], "before": p["dimensions"], "after": payload.name}
        for p in affected
    ]
    return {"products": changes, "product_versions": {p["id"]: p["version"] for p in affected}}


@router.get("")
def list_dimensions() -> list[dict]:
    """Include inactive settings so existing products can still display their values."""
    with transaction() as db:
        products = all_docs(db, "products")
        counts: dict[str, int] = {}
        for product in products:
            key = product.get("dimensions_id", "")
            counts[key] = counts.get(key, 0) + 1
        return [
            {**s, "usage_count": counts.get(s["id"], 0)}
            for s in sorted(all_docs(db, "dimensions"), key=lambda s: (s["sort_order"], s["name"]))
        ]


@router.post("", status_code=201)
def create_dimension(payload: Dimension) -> dict:
    """Add a unique option explicitly; products never create options implicitly."""
    with transaction() as db:
        if any(s["name"].casefold() == payload.name.casefold() for s in all_docs(db, "dimensions")):
            raise HTTPException(409, "이미 등록된 상세 규격 이름입니다. 사용 중지된 항목도 확인하세요.")
        return save_doc(db, "dimensions", payload.model_dump(exclude={"version", "product_versions"}))


@router.post("/{identifier}/preview")
def preview_dimension(identifier: str, payload: Dimension) -> dict:
    """Review name changes before updating linked product dimensions."""
    with transaction() as db:
        return dimension_preview(db, identifier, payload)


@router.put("/{identifier}")
def update_dimension(identifier: str, payload: Dimension) -> dict:
    """Rename a dimension and every linked product value atomically after an up-to-date preview."""
    with transaction() as db:
        preview = dimension_preview(db, identifier, payload)
        old = get_doc(db, "dimensions", identifier)
        if old["name"] != payload.name:
            if preview["products"] and payload.product_versions != preview["product_versions"]:
                raise HTTPException(
                    409, "연결된 제품이 변경되었거나 규격 변경 확인이 필요합니다. 미리보기를 다시 확인하세요."
                )
            for change in preview["products"]:
                product = get_doc(db, "products", change["id"])
                updated = save_doc(
                    db,
                    "products",
                    {**product, "dimensions": payload.name},
                    product["id"],
                    product["version"],
                )
                record_history(db, product["id"], product, updated, ["dimensions"], "상세 규격 설정 이름 변경")
        saved = save_doc(
            db, "dimensions", payload.model_dump(exclude={"version", "product_versions"}), identifier, payload.version
        )
        record_history(
            db, identifier, old, saved, ["name", "description", "sort_order", "active"], "상세 규격 설정 변경"
        )
        return saved
