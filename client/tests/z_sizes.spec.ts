import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("사이즈 설정 추가·입력 유지·선택·코드 변경 확인·사용 중지", async ({
  page,
  request,
}) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/products/new");
  await page.getByLabel("디자인", { exact: false }).fill("사이즈 설정 검증");
  await page.getByLabel("제품 종류", { exact: false }).fill("이불");
  await page.getByLabel("코드 prefix", { exact: false }).fill("SIZECHECK");
  await page.getByLabel("색상", { exact: false }).fill("화이트");
  await expect(page.getByRole("combobox", { name: "사이즈" })).toHaveValue("");
  await page.getByRole("button", { name: "사이즈 설정", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "사이즈 설정" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("사이즈 이름").fill("TESTSIZE");
  await dialog.getByLabel("설명 (선택)").fill("테스트 겸용");
  await dialog.getByLabel("표시 순서").fill("5");
  await dialog.getByRole("button", { name: "사이즈 추가 저장" }).click();
  await expect(
    dialog.getByRole("row").filter({ hasText: "TESTSIZE" }),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 375, height: 812 });
  await dialog.evaluate((el) => {
    el.scrollTop = 0;
  });
  expect(
    await dialog
      .locator(".size-settings-table td")
      .evaluateAll((cells) =>
        cells.every((cell) => cell.scrollHeight <= cell.clientHeight),
      ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/size-dialog-mobile.png",
    fullPage: true,
  });
  expect(
    await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBeTruthy();
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("디자인", { exact: false })).toHaveValue(
    "사이즈 설정 검증",
  );
  await page.getByRole("combobox", { name: "사이즈" }).selectOption("TESTSIZE");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "사이즈 설정 검증", exact: true }),
  ).toBeVisible();
  const id = new URL(page.url()).searchParams.get("product")!;
  const product = await (await request.get(`/api/products/${id}`)).json();
  expect(product.size_id).toBeTruthy();
  await page.goto("/settings/sizes");
  await page
    .getByRole("button", { name: "TESTSIZE 수정", exact: true })
    .click();
  await page.getByLabel("사이즈 이름").fill("TESTSIZE2");
  await page.getByRole("button", { name: "변경 내용 저장" }).click();
  await expect(
    page.getByText("SIZECHECK-화이트-TESTSIZE → SIZECHECK-화이트-TESTSIZE2"),
  ).toBeVisible();
  expect((await (await request.get(`/api/products/${id}`)).json()).size).toBe(
    "TESTSIZE",
  );
  await page
    .getByRole("button", { name: "1개 제품 코드 변경 및 저장" })
    .click();
  await expect(
    page.getByRole("button", { name: "TESTSIZE2 수정", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "TESTSIZE2 수정", exact: true })
    .click();
  await page.getByLabel("사용 여부").selectOption("inactive");
  await page.getByRole("button", { name: "변경 내용 저장" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "TESTSIZE2" }),
  ).toContainText("사용 중지");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/size-settings-desktop.png",
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.goto("/products/new");
  await expect(
    page
      .getByRole("combobox", { name: "사이즈" })
      .locator('option[value="TESTSIZE2"]'),
  ).toHaveCount(0);
  await page.goto(`/products/${id}/edit`);
  await expect(page.getByRole("combobox", { name: "사이즈" })).toHaveValue(
    "TESTSIZE2",
  );
  await expect(
    page.getByText(
      "사용 중지된 사이즈입니다. 이 제품의 기존 값은 유지할 수 있습니다.",
    ),
  ).toBeVisible();
  await page
    .getByLabel("비고", { exact: false })
    .fill("사용 중지 후 기존 제품 수정");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByText("사용 중지 후 기존 제품 수정", { exact: true }),
  ).toBeVisible();
});

test("엑셀 제품 행의 사이즈를 설정에 추가한 값으로 연결", async ({
  page,
  request,
}) => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  page.on("dialog", (d) => d.accept());
  await page.goto("/imports");
  const dataDir = path.resolve(import.meta.dirname, "../../data");
  const file = fs
    .readdirSync(dataDir)
    .find((n) => n.normalize("NFC").startsWith("상품기술서-"))!;
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.join(dataDir, file));
  await page.getByRole("button", { name: "원본 업로드 및 시트 확인" }).click();
  await page
    .getByRole("checkbox", { name: "차렵이불-리뉴얼 상품기술서", exact: true })
    .check();
  await page.getByLabel("디자인", { exact: true }).fill("사이즈 연결 이관");
  await page.getByLabel("제품 종류", { exact: true }).fill("이불");
  await page.getByLabel("코드 prefix", { exact: true }).fill("IMPORTSIZE");
  await page.getByRole("button", { name: "선택 시트 분석" }).click();
  const row = page
    .locator(".import-record")
    .filter({ has: page.getByText(/^제품 ·/) })
    .first();
  await row.getByRole("button", { name: "연결·변경 확인" }).click();
  await expect(row.getByRole("combobox", { name: "사이즈" })).toBeVisible();
  await page.getByRole("button", { name: "사이즈 설정", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "사이즈 설정" });
  await dialog.getByLabel("사이즈 이름").fill("IMPORTSIZE");
  await dialog.getByRole("button", { name: "사이즈 추가 저장" }).click();
  await expect(
    dialog.getByRole("row").filter({ hasText: "IMPORTSIZE" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await row
    .getByRole("combobox", { name: "사이즈" })
    .selectOption("IMPORTSIZE");
  await page
    .getByRole("button", { name: "상세 규격 설정", exact: true })
    .click();
  const dimensionDialog = page.getByRole("dialog", { name: "상세 규격 설정" });
  await dimensionDialog.getByLabel("상세 규격(cm)").fill("200 × 230");
  await dimensionDialog
    .getByRole("button", { name: "상세 규격 추가 저장" })
    .click();
  await expect(
    dimensionDialog.getByRole("button", { name: "200 × 230 수정" }),
  ).toBeVisible();
  await dimensionDialog
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await row
    .getByRole("combobox", { name: "상세 규격(cm)" })
    .selectOption("200 × 230");
  await page.getByRole("button", { name: "선택한 1개 항목 반영" }).click();
  await expect(
    page.getByRole("heading", { name: "반영 완료", exact: true }),
  ).toBeVisible();
  const products = await (
    await request.get("/api/products?q=IMPORTSIZE")
  ).json();
  expect(products.total).toBe(1);
  expect(products.items[0].size).toBe("IMPORTSIZE");
  expect(products.items[0].size_id).toBeTruthy();
  expect(products.items[0].dimensions).toBe("200 × 230");
  expect(products.items[0].dimensions_id).toBeTruthy();
});
