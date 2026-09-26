"""Read-only design catalog over existing products and specification groups."""

from fastapi import APIRouter, Query

from app.storage import all_docs, get_doc, transaction

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("")
def catalog(
    q: str = "",
    product_type: str = "",
    color: str = "",
    size: str = "",
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
) -> dict:
    """Filter variants together, then paginate whole designs without truncating summaries."""
    with transaction() as db:
        products = all_docs(db, "products")
        designs: dict[str, list[dict]] = {}
        for product in products:
            designs.setdefault(product["design"], []).append(product)
        items = []
        for design, variants in designs.items():
            matches = [
                p
                for p in variants
                if q.casefold() in f"{p['code']} {design}".casefold()
                and (not product_type or p["product_type"] == product_type)
                and (not color or p["color"] == color)
                and (not size or p["size"] == size)
            ]
            if matches:
                items.append(
                    {
                        "id": variants[0]["group_id"],
                        "design": design,
                        "product_types": sorted({p["product_type"] for p in variants}),
                        "colors": sorted({p["color"] for p in variants}),
                        "sizes": sorted({p["size"] for p in variants}),
                        "variant_count": len(variants),
                        "match_group_id": matches[0]["group_id"],
                        "match_product_id": matches[0]["id"] if any((q, product_type, color, size)) else None,
                    }
                )
        return {
            "items": items[(page - 1) * limit : page * limit],
            "total": len(items),
            "filters": {key: sorted({p[key] for p in products}) for key in ("product_type", "color", "size")},
        }


@router.get("/{group_id}")
def design_detail(group_id: str) -> dict:
    """Resolve a stable group ID to every type and variant of its current design."""
    with transaction() as db:
        anchor = get_doc(db, "groups", group_id)
        groups = [g for g in all_docs(db, "groups") if g["design"] == anchor["design"]]
        grouped = {g["id"]: {**g, "products": [], "files": []} for g in groups}
        for product in all_docs(db, "products"):
            if product["group_id"] in grouped:
                grouped[product["group_id"]]["products"].append(product)
        for asset in all_docs(db, "files"):
            if (
                asset.get("group_id") in grouped
                and asset["purpose"] in {"color", "overview"}
                and asset.get("current", True)
            ):
                grouped[asset["group_id"]]["files"].append(asset)
        return {"id": group_id, "design": anchor["design"], "groups": list(grouped.values())}
