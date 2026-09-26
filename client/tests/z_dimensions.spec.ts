import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("상세 규격 설정·입력 유지·이름 변경·사용 중지·선택 해제", async ({
  page,
  request,
}) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/products/new");
  await page.getByLabel("디자인", { exact: false }).fill("규격 설정 검증");
  await page.getByLabel("제품 종류", { exact: false }).fill("이불");
  await page.getByLabel("코드 prefix", { exact: false }).fill("DIMENSIONCHECK");
  await page.getByLabel("색상", { exact: false }).fill("화이트");
  await page
    .getByRole("combobox", { name: "사이즈", exact: false })
    .selectOption("SS");
  await expect(
    page.getByRole("combobox", { name: "상세 규격(cm)" }),
  ).toHaveValue("");
  await page
    .getByRole("button", { name: "상세 규격 설정", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "상세 규격 설정" });
  await dialog.getByLabel("상세 규격(cm)").fill("160 × 210");
  await dialog.getByLabel("설명 (선택)").fill("차렵이불");
  await dialog.getByRole("button", { name: "상세 규격 추가 저장" }).click();
  await expect(
    dialog.getByRole("button", { name: "160 × 210 수정" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  expect(
    await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/dimensions-dialog-mobile.png",
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByLabel("디자인", { exact: false })).toHaveValue(
    "규격 설정 검증",
  );
  await page
    .getByRole("combobox", { name: "상세 규격(cm)" })
    .selectOption("160 × 210");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "규격 설정 검증", exact: true }),
  ).toBeVisible();
  const id = new URL(page.url()).searchParams.get("product")!;
  const before = await (await request.get(`/api/products/${id}`)).json();
  expect(before.dimensions_id).toBeTruthy();
  await page.goto("/settings/sizes");
  await page.getByRole("link", { name: "상세 규격 관리" }).click();
  await page
    .getByRole("button", { name: "160 × 210 수정", exact: true })
    .click();
  await page.getByLabel("상세 규격(cm)").fill("160 × 220");
  await page.getByRole("button", { name: "변경 내용 저장" }).click();
  await expect(
    page.getByText(`${before.code}: 160 × 210 → 160 × 220`),
  ).toBeVisible();
  expect(
    (await (await request.get(`/api/products/${id}`)).json()).dimensions,
  ).toBe("160 × 210");
  await page
    .getByRole("button", { name: "1개 제품 상세 규격 변경 및 저장" })
    .click();
  await expect(
    page.getByRole("button", { name: "160 × 220 수정", exact: true }),
  ).toBeVisible();
  const after = await (await request.get(`/api/products/${id}`)).json();
  expect(after.code).toBe(before.code);
  expect(after.dimensions_id).toBe(before.dimensions_id);
  expect(after.dimensions).toBe("160 × 220");
  await page
    .getByRole("button", { name: "160 × 220 수정", exact: true })
    .click();
  await page.getByLabel("사용 여부").selectOption("inactive");
  await page.getByRole("button", { name: "변경 내용 저장" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "160 × 220" }),
  ).toContainText("사용 중지");
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/dimensions-settings-desktop.png",
    fullPage: true,
  });
  await page.goto("/products/new");
  await expect(
    page
      .getByRole("combobox", { name: "상세 규격(cm)" })
      .locator('option[value="160 × 220"]'),
  ).toHaveCount(0);
  await page.goto(`/products/${id}/edit`);
  await expect(
    page.getByRole("combobox", { name: "상세 규격(cm)" }),
  ).toHaveValue("160 × 220");
  await page.getByLabel("비고", { exact: false }).fill("사용 중지 규격 유지");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByText("사용 중지 규격 유지", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "편집", exact: true }).click();
  await page.getByRole("combobox", { name: "상세 규격(cm)" }).selectOption("");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "편집", exact: true }),
  ).toBeVisible();
  expect(
    (await (await request.get(`/api/products/${id}`)).json()).dimensions_id,
  ).toBeNull();
});
