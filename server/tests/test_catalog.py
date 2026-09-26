"""Design grouping, complete variant catalogs, and asset scoping."""

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PRODUCT_ADMIN_STORAGE", str(tmp_path))
    with TestClient(app) as client:
        for name in ("SS", "Q/K", "50x70"):
            response = client.post("/api/sizes", json={"name": name})
            assert response.status_code == 201, response.text
        yield client


def product(client, **changes):
    response = client.post(
        "/api/products",
        json={
            "design": "도즈",
            "product_type": "사계절 차렵이불",
            "prefix": "DOZE01",
            "color": "화이트",
            "size": "SS",
            **changes,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def put(client, url, body):
    response = client.put(url, json=body)
    assert response.status_code == 200, response.text
    return response.json()


def editable(item, model):
    return {k: v for k, v in item.items() if k in model.model_fields}


def test_catalog_groups_before_pagination_and_filters_same_variant(client):
    first = product(client)
    for index in range(29):
        product(client, color=f"색상{index}", size="Q/K")
    pillow = product(client, product_type="베개커버", prefix="PILLOW", size="50x70")
    product(client, design="두번째", prefix="SECOND")
    product(client, design="세번째", prefix="THIRD")
    page = client.get("/api/catalog?limit=1").json()
    assert page["total"] == 3 and len(page["items"]) == 1
    item = page["items"][0]
    assert item["id"] == first["group_id"] and item["variant_count"] == 31
    assert len(item["colors"]) == 30 and len(item["product_types"]) == 2
    assert client.get("/api/catalog?limit=1&page=2").json()["items"][0]["design"] == "두번째"
    matched = client.get("/api/catalog", params={"q": pillow["code"], "size": "50x70"}).json()
    assert matched["items"][0]["match_group_id"] == pillow["group_id"]
    assert matched["items"][0]["variant_count"] == 31
    assert client.get("/api/catalog", params={"color": "화이트", "size": "Q/K"}).json()["total"] == 0
    assert client.get("/api/catalog?page=0").status_code == 422


def test_catalog_full_family_and_stable_group_after_rename(client):
    from app.models import Product

    first = product(client)
    sibling = product(client, size="Q/K")
    pillow = product(client, product_type="베개커버", prefix="PILLOW", size="50x70")
    product(client, design="도즈 플러스", prefix="PLUS")
    family = client.get(f"/api/catalog/{first['group_id']}").json()
    assert len(family["groups"]) == 2
    assert {p["id"] for g in family["groups"] for p in g["products"]} == {first["id"], sibling["id"], pillow["id"]}
    put(client, f"/api/products/{first['id']}", {**editable(first, Product), "design": "도즈 리뉴얼"})
    renamed = client.get(f"/api/catalog/{first['group_id']}").json()
    assert renamed["design"] == "도즈 리뉴얼" and len(renamed["groups"]) == 1
    assert len(renamed["groups"][0]["products"]) == 2
    assert client.get("/api/catalog/unknown").status_code == 404


def test_catalog_current_color_images_stay_with_their_type(client):
    first = product(client)
    pillow = product(client, product_type="베개커버", prefix="PILLOW")
    image = io.BytesIO()
    Image.new("RGB", (10, 10), "white").save(image, "JPEG")
    fields = {"group_id": first["group_id"], "purpose": "color", "color": "화이트"}
    original = client.post("/api/files", data=fields, files={"file": ("white.jpg", image.getvalue())}).json()
    replacement = client.post(
        "/api/files", data={**fields, "replace_id": original["id"]}, files={"file": ("white2.jpg", image.getvalue())}
    ).json()
    family = client.get(f"/api/catalog/{first['group_id']}").json()
    groups = {g["id"]: g for g in family["groups"]}
    assert [f["id"] for f in groups[first["group_id"]]["files"]] == [replacement["id"]]
    assert groups[pillow["group_id"]]["files"] == []
