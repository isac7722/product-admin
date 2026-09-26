"""Dimension settings preserve identity, optional values, and import atomicity."""

import pytest
from fastapi.testclient import TestClient

from app.dimensions import migrate_dimensions
from app.main import app
from app.models import Product
from app.storage import all_docs, get_doc, initialize, save_doc, transaction


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PRODUCT_ADMIN_STORAGE", str(tmp_path))
    with TestClient(app) as client:
        client.post("/api/sizes", json={"name": "SS"})
        yield client


def editable(product):
    return {k: v for k, v in product.items() if k in Product.model_fields}


def product_body(**values):
    return {"design": "도즈", "product_type": "이불", "prefix": "DOZE", "color": "화이트", "size": "SS", **values}


def option(client, name="150 × 200", **values):
    response = client.post("/api/dimensions", json={"name": name, **values})
    assert response.status_code == 201, response.text
    return response.json()


def test_optional_registered_and_retired_dimensions(client):
    assert client.get("/api/dimensions").json() == []
    empty = client.post("/api/products", json=product_body()).json()
    assert empty["dimensions"] == "" and empty["dimensions_id"] is None
    assert client.post("/api/products", json=product_body(color="블루", dimensions="미등록")).status_code == 422
    dimension = option(client, sort_order=20)
    option(client, "50-70 × 100", sort_order=10)
    assert [d["sort_order"] for d in client.get("/api/dimensions").json()] == [10, 20]
    assert client.post("/api/dimensions", json={"name": " 150 × 200 "}).status_code == 409
    for name in ["", " ", "150\n200"]:
        assert client.post("/api/dimensions", json={"name": name}).status_code == 422
    response = client.put(f"/api/products/{empty['id']}", json={**editable(empty), "dimensions": dimension["name"]})
    assert response.status_code == 200
    product = response.json()
    assert product["dimensions_id"] == dimension["id"]
    retired = client.put(
        f"/api/dimensions/{dimension['id']}",
        json={"name": dimension["name"], "version": dimension["version"], "active": False},
    )
    assert retired.status_code == 200
    assert (
        client.post("/api/products", json=product_body(color="블루", dimensions=dimension["name"])).status_code == 422
    )
    updated = client.put(f"/api/products/{product['id']}", json={**editable(product), "notes": "유지"})
    assert updated.status_code == 200
    cleared = client.put(
        f"/api/products/{product['id']}",
        json={**editable(updated.json()), "dimensions": "", "dimensions_id": None},
    )
    assert cleared.status_code == 200 and cleared.json()["dimensions_id"] is None
    assert client.delete(f"/api/dimensions/{dimension['id']}").status_code == 405
    assert (
        client.put(
            f"/api/dimensions/{dimension['id']}",
            json={"name": dimension["name"], "version": retired.json()["version"], "active": True},
        ).status_code
        == 200
    )
    assert (
        client.post("/api/products", json=product_body(color="블루", dimensions=dimension["name"])).status_code == 201
    )


def test_rename_requires_current_preview_and_keeps_product_codes(client):
    dimension = option(client)
    first = client.post("/api/products", json=product_body(dimensions=dimension["name"])).json()
    payload = {"name": "160 × 210", "version": dimension["version"]}
    preview = client.post(f"/api/dimensions/{dimension['id']}/preview", json=payload).json()
    assert preview["products"][0]["before"] == dimension["name"]
    assert client.put(f"/api/dimensions/{dimension['id']}", json=payload).status_code == 409
    second = client.post("/api/products", json=product_body(color="블루", dimensions=dimension["name"])).json()
    assert (
        client.put(
            f"/api/dimensions/{dimension['id']}", json={**payload, "product_versions": preview["product_versions"]}
        ).status_code
        == 409
    )
    assert client.get(f"/api/products/{first['id']}").json()["dimensions"] == dimension["name"]
    preview = client.post(f"/api/dimensions/{dimension['id']}/preview", json=payload).json()
    response = client.put(
        f"/api/dimensions/{dimension['id']}", json={**payload, "product_versions": preview["product_versions"]}
    )
    assert response.status_code == 200
    for old in [first, second]:
        updated = client.get(f"/api/products/{old['id']}").json()
        assert updated["dimensions"] == payload["name"]
        assert updated["dimensions_id"] == dimension["id"]
        assert (updated["code"], updated["group_id"], updated["size_id"]) == (
            old["code"],
            old["group_id"],
            old["size_id"],
        )
        history = client.get(f"/api/history/{old['id']}").json()
        assert history[0]["changes"]["dimensions"]["before"] == old["dimensions"]
    assert client.put(f"/api/products/{first['id']}", json=editable(first)).status_code == 409
    assert client.put(f"/api/dimensions/{dimension['id']}", json=payload).status_code == 409


def test_legacy_dimensions_migrate_once_without_changing_values(tmp_path, monkeypatch):
    monkeypatch.setenv("PRODUCT_ADMIN_STORAGE", str(tmp_path))
    initialize()
    with transaction() as db:
        first = save_doc(db, "products", {"dimensions": "150 × 200", "code": "OLD-화이트-SS", "notes": "보존"})
        second = save_doc(db, "products", {"dimensions": "150 × 200", "code": "OLD-블루-SS"})
        empty = save_doc(db, "products", {"dimensions": "", "code": "OLD-크림-SS"})
    migrate_dimensions()
    with transaction() as db:
        migrated = all_docs(db, "products")
        assert len(all_docs(db, "dimensions")) == 1
        assert (
            get_doc(db, "products", first["id"])["dimensions_id"]
            == get_doc(db, "products", second["id"])["dimensions_id"]
        )
        assert get_doc(db, "products", first["id"])["notes"] == "보존"
        assert get_doc(db, "products", first["id"])["code"] == first["code"]
        assert get_doc(db, "products", empty["id"]) == empty
    migrate_dimensions()
    with transaction() as db:
        assert all_docs(db, "products") == migrated


def test_import_requires_mapping_and_replaces_old_dimension_id(client):
    old_dimension = option(client)
    new_dimension = option(client, "200 × 230")
    product = client.post("/api/products", json=product_body(dimensions=old_dimension["name"])).json()
    with transaction() as db:
        job = save_doc(
            db,
            "imports",
            {
                "status": "비교·선택",
                "context": {},
                "snapshots": {product["id"]: product["version"]},
                "records": [{"key": "row", "kind": "products", "source": {"sheet": "제품"}, "mapping_key": "row"}],
            },
        )
    payload = {
        "version": job["version"],
        "choices": [
            {
                "key": "row",
                "target_id": product["id"],
                "values": {"dimensions": "미등록"},
                "fields": ["dimensions"],
            }
        ],
    }
    assert client.post(f"/api/imports/{job['id']}/apply", json=payload).status_code == 422
    assert client.get(f"/api/products/{product['id']}").json()["dimensions"] == old_dimension["name"]
    payload["choices"][0]["values"]["dimensions"] = new_dimension["name"]
    assert client.post(f"/api/imports/{job['id']}/apply", json=payload).status_code == 200
    updated = client.get(f"/api/products/{product['id']}").json()
    assert updated["dimensions_id"] == new_dimension["id"]
    assert updated["code"] == product["code"]
