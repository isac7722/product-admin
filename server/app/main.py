"""Local product administration HTTP API."""

import hashlib
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image, UnidentifiedImageError
from pydantic import ValidationError

from app.catalog import router as catalog_router
from app.dimensions import migrate_dimensions
from app.dimensions import router as dimensions_router
from app.models import Cost, Product, Rate, Sale, Shooting, Specification
from app.services import rate_used, save_cost, save_product, save_rate, save_sale, save_shooting
from app.sizes import migrate_sizes
from app.sizes import router as sizes_router
from app.storage import all_docs, get_doc, initialize, save_doc, storage_dir, transaction


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Prepare local storage and link existing product sizes to settings."""
    initialize()
    migrate_sizes()
    migrate_dimensions()
    yield


app = FastAPI(title="제품 관리 어드민 API", version="1.0.0", lifespan=lifespan)
app.include_router(catalog_router)
app.include_router(sizes_router)
app.include_router(dimensions_router)


@app.exception_handler(RequestValidationError)
async def invalid_request(request, exc):
    """Use a stable, readable validation error contract."""
    return JSONResponse(
        status_code=422,
        content={"detail": [{"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"]} for e in exc.errors()]},
    )


@app.exception_handler(ValidationError)
async def invalid_document(request, exc):
    """Report import validation with the same error shape."""
    return JSONResponse(
        status_code=422,
        content={"detail": [{"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"]} for e in exc.errors()]},
    )


@app.get("/api/health")
def health():
    """Confirm the correct service and database connection."""
    with transaction() as db:
        db.execute("SELECT 1")
    return {"status": "ok", "service": "product-admin", "database": "sqlite"}


@app.get("/api/products")
def products(
    q: str = "",
    product_type: str = "",
    color: str = "",
    size: str = "",
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
):
    """Search physical variants with stable pagination."""
    with transaction() as db:
        rows = all_docs(db, "products")
        filtered = [
            p
            for p in rows
            if q.casefold() in f"{p['code']} {p['design']}".casefold()
            and (not product_type or p["product_type"] == product_type)
            and (not color or p["color"] == color)
            and (not size or p["size"] == size)
        ]
        return {
            "items": filtered[(page - 1) * limit : page * limit],
            "total": len(filtered),
            "filters": {key: sorted({r[key] for r in rows}) for key in ("product_type", "color", "size")},
        }


@app.post("/api/products", status_code=201)
def create_product(payload: Product):
    """Register a physical variant."""
    with transaction() as db:
        return save_product(db, payload)


@app.get("/api/products/{identifier}")
def product(identifier: str):
    """Return a variant and its shared group."""
    with transaction() as db:
        item = get_doc(db, "products", identifier)
        return {**item, "group": get_doc(db, "groups", item["group_id"])}


@app.put("/api/products/{identifier}")
def update_product(identifier: str, payload: Product):
    """Update identity while preserving internal relationships."""
    with transaction() as db:
        return save_product(db, payload, identifier)


@app.get("/api/groups")
def groups():
    """List design/type groups for file and product selection."""
    with transaction() as db:
        return all_docs(db, "groups")


@app.get("/api/groups/{identifier}")
def group(identifier: str):
    """Fetch a shared specification and related resources together."""
    with transaction() as db:
        result = get_doc(db, "groups", identifier)
        for kind in ("products", "shooting", "sales", "files"):
            result[kind] = [
                x
                for x in all_docs(db, kind)
                if x.get("group_id") == identifier and (kind != "files" or x.get("current", True))
            ]
        return result


@app.put("/api/groups/{identifier}/spec")
def update_spec(identifier: str, payload: Specification):
    """Save fields shared by every color and size in this group."""
    with transaction() as db:
        old = get_doc(db, "groups", identifier)
        return save_doc(
            db,
            "groups",
            {**old, "spec": payload.model_dump(mode="json", exclude={"version"})},
            identifier,
            payload.version,
        )


@app.put("/api/groups/{identifier}/shooting")
def update_shooting(identifier: str, payload: Shooting):
    """Save color-specific shooting guidance."""
    with transaction() as db:
        return save_shooting(db, identifier, payload)


@app.get("/api/rates")
def rates(q: str = "", category: str = ""):
    """Search cost inputs and include dependent product counts."""
    with transaction() as db:
        costs = all_docs(db, "costs")
        return [
            {**r, "affected_products": [c["product_id"] for c in costs if rate_used(c, r["id"])]}
            for r in all_docs(db, "rates")
            if q.casefold() in f"{r['name']} {r['conditions']}".casefold()
            and (not category or r["category"] == category)
        ]


@app.post("/api/rates", status_code=201)
def create_rate(payload: Rate):
    """Create an explicit unit/VAT input."""
    with transaction() as db:
        return save_rate(db, payload)


@app.put("/api/rates/{identifier}")
def update_rate(identifier: str, payload: Rate):
    """Change a rate and recalculate all dependent snapshots atomically."""
    with transaction() as db:
        return save_rate(db, payload, identifier)


@app.get("/api/products/{identifier}/cost")
def cost(identifier: str):
    """Return stored inputs and server-calculated outputs."""
    with transaction() as db:
        get_doc(db, "products", identifier)
        return next((c for c in all_docs(db, "costs") if c["product_id"] == identifier), None)


@app.put("/api/products/{identifier}/cost")
def update_cost(identifier: str, payload: Cost):
    """Save cost inputs with optimistic locking."""
    with transaction() as db:
        return save_cost(db, identifier, payload)


@app.get("/api/history/{identifier}")
def history(identifier: str):
    """List actual monetary changes, newest first."""
    with transaction() as db:
        return [
            {**dict(r), "changes": json.loads(r["changes"])}
            for r in db.execute("SELECT * FROM history WHERE entity_id=? ORDER BY created_at DESC", (identifier,))
        ]


@app.post("/api/sales", status_code=201)
def create_sale(payload: Sale):
    """Create a manual sales composition."""
    with transaction() as db:
        return save_sale(db, payload)


@app.put("/api/sales/{identifier}")
def update_sale(identifier: str, payload: Sale):
    """Update a composition independently from shooting guidance."""
    with transaction() as db:
        return save_sale(db, payload, identifier)


@app.get("/api/files")
def files(group_id: str = "", purpose: str = "", q: str = ""):
    """Show current assets; uploaded Excel sources are listed in imports."""
    with transaction() as db:
        group_map = {g["id"]: g for g in all_docs(db, "groups")}
        rows = []
        for f in all_docs(db, "files"):
            if f["purpose"] == "excel" or not f.get("current", True):
                continue
            g = group_map.get(f.get("group_id"), {})
            item = {**f, "design": g.get("design", ""), "product_type": g.get("product_type", "")}
            searchable = f"{item['design']} {item['product_type']} {item['color']} {item['name']}".casefold()
            if (
                (not group_id or f.get("group_id") == group_id)
                and (not purpose or f["purpose"] == purpose)
                and q.casefold() in searchable
            ):
                rows.append(item)
        return rows


async def receive_file(upload: UploadFile, purpose: str) -> dict:
    """Stream bounded uploads and verify content before activation."""
    extension = Path(upload.filename or "").suffix.lower()
    allowed = {
        "excel": ({".xlsx"}, 50),
        "psd": ({".psd"}, 500),
        "overview": ({".jpg", ".jpeg"}, 20),
        "color": ({".jpg", ".jpeg"}, 20),
    }
    if purpose not in allowed or extension not in allowed[purpose][0]:
        raise HTTPException(422, "허용되지 않는 파일 형식입니다.")
    folder = storage_dir() / "uploads"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{uuid4()}{extension}"
    digest = hashlib.sha256()
    size = 0
    try:
        with path.open("wb") as target:
            while chunk := await upload.read(1024 * 1024):
                size += len(chunk)
                if size > allowed[purpose][1] * 1024 * 1024:
                    raise HTTPException(413, f"파일은 {allowed[purpose][1]}MB 이하여야 합니다.")
                target.write(chunk)
                digest.update(chunk)
        if purpose in {"overview", "color"}:
            try:
                with Image.open(path) as img:
                    if img.format != "JPEG":
                        raise HTTPException(422, "실제 JPG 파일을 선택하세요.")
                    img.verify()
            except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
                raise HTTPException(422, "이미지를 읽을 수 없습니다.") from exc
        if purpose == "psd":
            with path.open("rb") as source:
                if source.read(6) != b"8BPS\x00\x01":
                    raise HTTPException(422, "유효한 PSD 원본을 선택하세요.")
        if size == 0:
            raise HTTPException(422, "빈 파일은 업로드할 수 없습니다.")
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return {
        "name": Path(upload.filename).name,
        "path": path.name,
        "size": size,
        "sha256": digest.hexdigest(),
        "purpose": purpose,
        "current": True,
    }


@app.post("/api/files", status_code=201)
async def upload_file(
    file: Annotated[UploadFile, File()],
    group_id: Annotated[str, Form()],
    purpose: Annotated[str, Form()],
    color: Annotated[str, Form()] = "",
    replace_id: Annotated[str, Form()] = "",
):
    """Activate a verified asset and retire its previous current file."""
    if purpose not in {"overview", "color", "psd"} or (purpose == "color" and not color):
        raise HTTPException(422, "자료 용도와 색상을 확인하세요.")
    body = await receive_file(file, purpose)
    try:
        with transaction() as db:
            get_doc(db, "groups", group_id)
            if purpose == "overview" and color:
                raise HTTPException(422, "전체 색상 모음은 기술서 공통으로 등록하세요.")
            if color and not any(p["group_id"] == group_id and p["color"] == color for p in all_docs(db, "products")):
                raise HTTPException(422, "해당 기술서에 등록된 색상을 선택하세요.")
            previous = next(
                (
                    f
                    for f in all_docs(db, "files")
                    if f.get("group_id") == group_id
                    and f["purpose"] == purpose
                    and f.get("color", "") == color
                    and f.get("current")
                    and purpose != "psd"
                ),
                None,
            )
            if previous and replace_id != previous["id"]:
                raise HTTPException(409, "현재 파일이 있습니다. 교체 대상을 확인하세요.")
            if replace_id and (previous is None or previous["id"] != replace_id):
                raise HTTPException(409, "현재 파일이 변경되었습니다. 다시 확인하세요.")
            if previous:
                save_doc(db, "files", {**previous, "current": False}, previous["id"], previous["version"])
            result = save_doc(db, "files", {**body, "group_id": group_id, "color": color})
            if purpose in {"overview", "color"}:
                with Image.open(storage_dir() / "uploads" / body["path"]) as img:
                    img.thumbnail((800, 800))
                    img.convert("RGB").save(storage_dir() / "uploads" / f"{result['id']}.jpg", "JPEG")
            return result
    except Exception:
        (storage_dir() / "uploads" / body["path"]).unlink(missing_ok=True)
        raise


@app.get("/api/files/{identifier}/download")
def download_file(identifier: str):
    """Download unchanged original bytes with a safe filename."""
    with transaction() as db:
        item = get_doc(db, "files", identifier)
        return FileResponse(
            storage_dir() / "uploads" / item["path"],
            filename=item["name"],
            headers={"X-Content-Type-Options": "nosniff"},
        )


@app.get("/api/files/{identifier}/preview")
def preview_file(identifier: str):
    """Serve only derived JPEG previews, never PSD or Excel inline."""
    with transaction() as db:
        item = get_doc(db, "files", identifier)
        if item["purpose"] not in {"overview", "color"}:
            raise HTTPException(422, "미리보기를 지원하지 않는 자료입니다.")
    return FileResponse(storage_dir() / "uploads" / f"{identifier}.jpg", media_type="image/jpeg")


# Import after app construction to keep shared upload logic in one place.
from app.workbooks import register_routes  # noqa: E402

register_routes(app, receive_file)
