import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
const api = "/api";

test("디자인별 목록·종류·컬러·사이즈·새로고침·모바일", async ({
  page,
  request,
}) => {
  const sizesResponse = await request.get(`${api}/sizes`);
  if (sizesResponse.ok()) {
    const sizes = await sizesResponse.json();
    for (const name of ["SS", "Q/K", "50x70"]) {
      if (!sizes.some((s: any) => s.name === name)) {
        expect(
          (await request.post(`${api}/sizes`, { data: { name } })).status(),
        ).toBe(201);
      }
    }
  }
  const create = async (changes: Record<string, string>) => {
    const response = await request.post(`${api}/products`, {
      data: {
        design: "카탈로그 도즈",
        product_type: "사계절 차렵이불",
        prefix: "CATALOG",
        color: "화이트",
        size: "SS",
        ...changes,
      },
    });
    expect(response.status()).toBe(201);
    return response.json();
  };
  const ss = await create({});
  const qk = await create({ size: "Q/K" });
  await create({ color: "크림" });
  const pillow = await create({
    product_type: "베개커버",
    prefix: "CATPILLOW",
    size: "50x70",
  });
  const jpg = fs.readFileSync(
    path.resolve(import.meta.dirname, "fixtures/color.jpg"),
  );
  const asset = await request.post(`${api}/files`, {
    multipart: {
      group_id: ss.group_id,
      purpose: "color",
      color: "화이트",
      file: { name: "catalog.jpg", mimeType: "image/jpeg", buffer: jpg },
    },
  });
  expect(asset.status()).toBe(201);
  await page.goto("/products?q=카탈로그");
  await expect(
    page.getByRole("link", { name: "카탈로그 도즈", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("row").filter({ hasText: "카탈로그 도즈" }),
  ).toContainText("4개");
  await page.getByRole("link", { name: "카탈로그 도즈", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "컬러·사이즈", exact: true }),
  ).toBeVisible();
  const types = page.getByRole("navigation", { name: "제품 종류 선택" });
  const matrix = page.getByRole("region", { name: "전체 컬러와 사이즈 조합" });
  await expect(
    matrix.getByRole("link", { name: "화이트 Q/K 선택" }),
  ).toBeVisible();
  await expect(
    matrix.getByRole("row").filter({ hasText: "크림" }),
  ).toContainText("미등록");
  await expect(matrix.getByRole("link", { name: "크림 Q/K 선택" })).toHaveCount(
    0,
  );
  await expect(matrix.getByAltText("화이트 컬러칩")).toBeVisible();
  await matrix.getByRole("link", { name: "화이트 Q/K 선택" }).click();
  await expect(page.getByText(qk.code, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "선택한 조합" }),
  ).toContainText("화이트 / Q/K");
  const selectedUrl = page.url();
  await page.reload();
  await expect(
    matrix.getByRole("link", { name: "화이트 Q/K 선택" }),
  ).toHaveAttribute("aria-current", "true");
  await types.getByRole("link", { name: "베개커버", exact: true }).click();
  await expect(
    matrix.getByRole("link", { name: "화이트 50x70 선택" }),
  ).toBeVisible();
  await expect(matrix.getByAltText("화이트 컬러칩")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "제품정보", exact: true }),
  ).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(selectedUrl);
  await expect(page.getByText(qk.code, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "상품기술서" })).toHaveAttribute(
    "href",
    `/groups/${ss.group_id}`,
  );
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  await expect(page.locator(".skeleton")).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await expect(
      matrix.getByRole("link", { name: "화이트 SS 선택" }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/catalog-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 768, height: 375 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.goto(
    `/catalog/${ss.group_id}?group=${ss.group_id}&product=${pillow.id}`,
  );
  await expect(page.getByRole("alert")).toContainText(
    "이 종류에 속한 제품을 찾을 수 없습니다",
  );
  await expect(
    page.getByRole("heading", { name: "제품정보", exact: true }),
  ).toHaveCount(0);
  await page.goto(`/products/${ss.id}/cost`);
  await expect(page.getByText(ss.code, { exact: true })).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`/catalog/${ss.group_id}.*product=${ss.id}`),
  );
  await page.getByRole("link", { name: "제품 목록" }).click();
  await expect(
    page.getByPlaceholder("제품코드 또는 디자인명 검색"),
  ).toHaveValue("카탈로그");

  await page.goto(`/catalog/${ss.group_id}?product=${ss.id}`);
  await page.getByRole("button", { name: "원가·판매가 등록" }).click();
  await page.getByLabel("상시할인가(원)").fill("81000");
  await page.getByRole("link", { name: "화이트 Q/K 선택" }).click();
  await expect(
    page.getByText("저장하지 않은 변경사항이 있습니다."),
  ).toBeVisible();
  await page.getByRole("button", { name: "계속 편집" }).click();
  await expect(page.getByLabel("상시할인가(원)")).toHaveValue("81000");
  await page.getByRole("link", { name: "화이트 Q/K 선택" }).click();
  await page.getByRole("button", { name: "변경사항 버리기" }).click();
  await expect(page.getByLabel("상시할인가(원)")).toHaveCount(0);
  await page.getByRole("link", { name: "화이트 SS 선택" }).click();
  expect(
    (
      await request.post(`${api}/dimensions`, { data: { name: "150 × 200" } })
    ).status(),
  ).toBe(201);
  await page.getByRole("link", { name: "편집", exact: true }).click();
  await page
    .getByRole("combobox", { name: "상세 규격(cm)" })
    .selectOption("150 × 200");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("150 × 200", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "컬러·사이즈 추가" }).click();
  await expect(page.getByLabel("디자인", { exact: false })).toHaveValue(
    "카탈로그 도즈",
  );
  await expect(page.getByLabel("제품 종류", { exact: false })).toHaveValue(
    "사계절 차렵이불",
  );
  await expect(page.getByLabel("코드 prefix", { exact: false })).toHaveValue(
    "CATALOG",
  );
  await page.getByLabel("색상", { exact: false }).fill("블루");
  await page.getByLabel("사이즈", { exact: false }).selectOption("SS");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "블루 SS 선택" }),
  ).toHaveAttribute("aria-current", "true");
});
