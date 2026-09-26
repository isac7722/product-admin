"""Size settings preserve product identity and validate every input path."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import Product
from app.sizes import migrate_sizes
from app.storage import all_docs, get_doc, initialize, save_doc, transaction


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PRODUCT_ADMIN_STORAGE", str(tmp_path))
    with TestClient(app) as client:
        yield client


def size(client, name="SS", **values):
    result = client.post("/api/sizes", json={"name": name, **values})
    assert result.status_code == 201, result.text
    return result.json()


def create_product(client, **values):
    result = client.post(
        "/api/products",
        json={
            "design": "도즈",
            "product_type": "이불",
            "prefix": "DOZE",
            "color": "화이트",
            "size": "SS",
            **values,
        },
    )
    assert result.status_code == 201, result.text
    return result.json()


def editable(product):
    return {k: v for k, v in product.items() if k in Product.model_fields}


def test_options_validation_sort_and_retirement(client):
    assert client.get("/api/sizes").json() == []
    response = client.post(
        "/api/products",
        json={
            "design": "도즈",
            "product_type": "이불",
            "prefix": "DOZE",
            "color": "화이트",
            "size": "미등록",
        },
    )
    assert response.status_code == 422
    assert client.get("/api/groups").json() == []
    ss = size(client, sort_order=20)
    size(client, "Q/K", sort_order=10)
    assert [s["name"] for s in client.get("/api/sizes").json()] == ["Q/K", "SS"]
    assert client.post("/api/sizes", json={"name": " ss "}).status_code == 409
    for name in ["", " ", "S-S", "S\nS"]:
        assert client.post("/api/sizes", json={"name": name}).status_code == 422
    product = create_product(client)
    assert product["size_id"] == ss["id"]
    retired = client.put(f"/api/sizes/{ss['id']}", json={"name": "SS", "active": False, "version": ss["version"]})
    assert retired.status_code == 200
    assert next(s for s in client.get("/api/sizes").json() if s["id"] == ss["id"])["usage_count"] == 1
    assert client.post("/api/products", json={**editable(product), "color": "블루"}).status_code == 422
    updated = client.put(f"/api/products/{product['id']}", json={**editable(product), "notes": "기존 제품 수정"})
    assert updated.status_code == 200
    assert client.delete(f"/api/sizes/{ss['id']}").status_code == 405
    resumed = client.put(
        f"/api/sizes/{ss['id']}", json={"name": "SS", "active": True, "version": retired.json()["version"]}
    )
    assert resumed.status_code == 200
    create_product(client, color="블루")


def test_rename_preview_is_atomic_and_detects_new_products(client):
    ss = size(client)
    first = create_product(client)
    payload = {"name": "슈퍼싱글", "version": ss["version"]}
    preview = client.post(f"/api/sizes/{ss['id']}/preview", json=payload).json()
    assert preview["products"][0]["after"] == "DOZE-화이트-슈퍼싱글"
    assert client.put(f"/api/sizes/{ss['id']}", json=payload).status_code == 409
    second = create_product(client, color="블루")
    assert (
        client.put(
            f"/api/sizes/{ss['id']}", json={**payload, "product_versions": preview["product_versions"]}
        ).status_code
        == 409
    )
    assert client.get(f"/api/products/{first['id']}").json()["size"] == "SS"
    preview = client.post(f"/api/sizes/{ss['id']}/preview", json=payload).json()
    result = client.put(f"/api/sizes/{ss['id']}", json={**payload, "product_versions": preview["product_versions"]})
    assert result.status_code == 200
    for original in [first, second]:
        updated = client.get(f"/api/products/{original['id']}").json()
        assert updated["size_id"] == ss["id"]
        assert updated["group_id"] == original["group_id"]
        assert updated["size"] == "슈퍼싱글"
        assert updated["version"] == original["version"] + 1
        assert client.get(f"/api/history/{original['id']}").json()[0]["changes"]["code"]["before"] == original["code"]
    assert client.put(f"/api/products/{first['id']}", json=editable(first)).status_code == 409
    size(client, "Q/K")
    assert (
        client.put(f"/api/sizes/{ss['id']}", json={"name": "Q/K", "version": result.json()["version"]}).status_code
        == 409
    )


def test_legacy_migration_preserves_codes_and_is_idempotent(tmp_path, monkeypatch):
    monkeypatch.setenv("PRODUCT_ADMIN_STORAGE", str(tmp_path))
    initialize()
    with transaction() as db:
        old = save_doc(db, "products", {"size": "Q/K", "code": "OLD-화이트-Q/K", "notes": "원본 유지"})
    migrate_sizes()
    with transaction() as db:
        migrated = get_doc(db, "products", old["id"])
        assert migrated["code"] == old["code"]
        assert migrated["notes"] == old["notes"]
        assert len(all_docs(db, "sizes")) == 1
        setting = get_doc(db, "sizes", migrated["size_id"])
        save_doc(db, "sizes", {**setting, "active": False}, setting["id"], setting["version"])
    migrate_sizes()
    with transaction() as db:
        assert get_doc(db, "products", old["id"]) == migrated
        assert not get_doc(db, "sizes", migrated["size_id"])["active"]


def test_import_requires_registered_size_and_allows_explicit_mapping(client):
    size(client, "Q/K")
    values = {"design": "도즈", "product_type": "이불", "prefix": "DOZE", "color": "화이트", "size": "퀸킹"}
    with transaction() as db:
        job = save_doc(
            db,
            "imports",
            {
                "status": "비교·선택",
                "context": {},
                "snapshots": {},
                "records": [{"key": "row", "kind": "products", "source": {"sheet": "제품"}, "mapping_key": "row"}],
            },
        )
    payload = {"version": job["version"], "choices": [{"key": "row", "values": values, "fields": list(values)}]}
    assert client.post(f"/api/imports/{job['id']}/apply", json=payload).status_code == 422
    assert client.get("/api/products").json()["total"] == 0
    values["size"] = "Q/K"
    assert client.post(f"/api/imports/{job['id']}/apply", json=payload).status_code == 200
    product = client.get("/api/products").json()["items"][0]
    assert product["size"] == "Q/K" and product["size_id"]
