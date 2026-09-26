"""Validated contracts for the local product administration API."""

import unicodedata
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Amount = Annotated[Decimal, Field(ge=0, max_digits=20, decimal_places=6)]


class Model(BaseModel):
    """Reject misspelled API fields rather than silently ignoring them."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    version: int | None = None


class Product(Model):
    """A physical design/type/color/size variant."""

    design: str = Field(min_length=1, max_length=120)
    product_type: str = Field(min_length=1, max_length=120)
    prefix: str = Field(min_length=1, max_length=80)
    color: str = Field(min_length=1, max_length=120)
    size: str = Field(min_length=1, max_length=80)
    size_id: str | None = None
    dimensions: str = ""
    dimensions_id: str | None = None
    notes: str = ""
    source: dict | None = None

    @field_validator("design", "product_type", "prefix", "color", "size")
    @classmethod
    def normalize(cls, value: str, info) -> str:
        """Preserve meaningful internal spaces and Q/K size labels."""
        value = unicodedata.normalize("NFC", value).strip()
        if not value or any(unicodedata.category(c).startswith("C") for c in value):
            raise ValueError("이름은 비어 있거나 제어문자를 포함할 수 없습니다.")
        if info.field_name in {"prefix", "color", "size"} and "-" in value:
            raise ValueError("코드 구성값에는 하이픈(-)을 사용할 수 없습니다.")
        return value


class Specification(Model):
    """Shared technical fields for a design and product type."""

    name_ko: str = ""
    name_en: str = ""
    front_material: str = ""
    back_material: str = ""
    filling: str = ""
    country: str = ""
    keywords: str = ""
    description: str = ""
    notes: str = ""
    color_details: str = ""
    source: dict | None = None


class ShootingItem(BaseModel):
    """An optional product link with human shooting instructions."""

    role: Literal["기본 베개커버", "코디 베개커버", "침대패드"]
    product_id: str | None = None
    notes: str = ""


class Shooting(Model):
    """A color-specific composition within a shared specification."""

    color: str = Field(min_length=1)
    front_color: str = ""
    back_color: str = ""
    items: list[ShootingItem] = Field(default_factory=list)
    notes: str = ""
    source: dict | None = None


class SaleItem(BaseModel):
    """Physical contents independent of the customer-facing size label."""

    product_id: str
    quantity: int = Field(ge=1, le=10000)
    display_name: str = ""


class Sale(Model):
    """A manually maintained offer attached to one specification."""

    group_id: str
    channel: Literal["자사몰", "입점몰", "도매몰"]
    sale_type: Literal["단품", "세트", "추가옵션"]
    name: str = Field(min_length=1, max_length=240)
    parent_id: str | None = None
    items: list[SaleItem] = Field(min_length=1)
    notes: str = ""
    source: dict | None = None


class Rate(Model):
    """A priced input with explicit unit and VAT basis."""

    name: str = Field(min_length=1, max_length=240)
    category: Literal["원단", "솜", "부자재", "제작공임", "택배비", "포장비", "기타"]
    unit: str = Field(min_length=1, max_length=40)
    amount: Amount | None = None
    vat_included: bool = False
    conditions: str = ""
    supplier: str = ""
    notes: str = ""
    source: dict | None = None


class CostLine(BaseModel):
    """A production cost input; shipping is kept separately."""

    rate_id: str
    quantity: Amount
    loss_rate: Amount = Decimal("0")
    label: str = ""

    @field_validator("loss_rate")
    @classmethod
    def valid_loss(cls, value: Decimal) -> Decimal:
        """Loss is a ratio, not a percentage integer."""
        if value > 1:
            raise ValueError("로스율은 0~1 사이 값입니다.")
        return value


class Cost(Model):
    """Editable calculation inputs; all derived amounts are server-owned."""

    lines: list[CostLine] = Field(default_factory=list)
    unresolved_inputs: list[str] = Field(default_factory=list)
    sale_price: Amount | None = None
    shipping_rate_id: str | None = None
    packaging_rate_id: str | None = None
    source: dict | None = None
