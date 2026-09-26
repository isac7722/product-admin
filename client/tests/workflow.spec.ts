import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
const api = "/api";
test("제품 → 기술서·촬영 → 판매구성 → 원가·단가 변경 → 출력", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto("/products");
  await expect(page.getByText("등록된 제품이 없습니다.")).toBeVisible();
  await request.post(`${api}/sizes`, { data: { name: "Q/K" } });
  await page.getByRole("link", { name: "제품 등록", exact: true }).click();
  for (const [name, value] of [
    ["디자인", "브라우저 도즈"],
    ["제품 종류", "사계절 차렵이불"],
    ["코드 prefix", "BROWSER"],
    ["색상", "화이트"],
  ])
    await page.getByLabel(name, { exact: false }).fill(value);
  await page.getByLabel("사이즈", { exact: false }).selectOption("Q/K");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "브라우저 도즈", exact: true }),
  ).toBeVisible();
  const productId = new URL(page.url()).searchParams.get("product")!;
  await page.getByRole("link", { name: "상품기술서" }).click();
  await page.getByRole("button", { name: "기술서 편집" }).click();
  await page.getByLabel("상품명(한글)").fill("도즈 고밀도 순면 차렵이불");
  await page.getByLabel("앞 원단·소재").fill("면 100%");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("면 100%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "촬영구성 편집" }).click();
  await page
    .getByLabel("촬영 비고·추가 참고 항목")
    .fill("화이트 배경에서 촬영");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("화이트 배경에서 촬영")).toBeVisible();
  await page.getByRole("link", { name: "판매구성", exact: true }).click();
  await page.getByRole("button", { name: "판매구성 등록" }).click();
  await page.getByLabel("판매용 제품명").fill("도즈 킹 이불");
  await page.getByLabel("제품 선택", { exact: true }).selectOption(productId);
  await page.getByLabel("판매 표시명 (예: 킹 K)").fill("킹 K");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "도즈 킹 이불" }),
  ).toBeVisible();
  const rate = async (name: string, category: string, amount: string) =>
    (
      await request.post(`${api}/rates`, {
        data: {
          name,
          category,
          amount,
          unit: "개",
          vat_included: category !== "원단",
        },
      })
    ).json();
  const fabric = await rate("테스트 원단", "원단", "1000"),
    shipping = await rate("테스트 택배", "택배비", "2000"),
    pack = await rate("테스트 포장", "포장비", "500");
  await page.goto(`/products/${productId}/cost`);
  await page.getByRole("button", { name: "원가·판매가 등록" }).click();
  await page.getByRole("button", { name: "원가 항목 추가" }).click();
  await page.getByLabel("자재·공임", { exact: true }).selectOption(fabric.id);
  await page.getByLabel("소요량", { exact: true }).fill("2.5");
  await page.getByLabel("상시할인가(원)").fill("70000");
  await page.getByLabel("택배비", { exact: true }).selectOption(shipping.id);
  await page.getByLabel("포장비", { exact: true }).selectOption(pack.id);
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("116,700원", { exact: true })).toBeVisible();
  await expect(page.getByText("2,942.5원", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "자재·공임 단가", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "테스트 원단" });
  await row.getByRole("button", { name: "편집" }).click();
  await page.getByLabel("단가(원)").fill("2000");
  await page.getByRole("button", { name: "단가 변경 및 재계산" }).click();
  await page.goto(`/products/${productId}/cost`);
  await expect(page.getByText("5,885원", { exact: true })).toBeVisible();
  await expect(page.getByText("70,000원", { exact: true })).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "최신 원가계산서 XLSX 다운로드" })
    .click();
  expect((await downloaded).suggestedFilename()).toBe("product-cost.xlsx");
  expect(errors).toEqual([]);
});

test("실제 단가표 업로드 → 필드 선택 반영 → 원본 다운로드", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/imports");
  await page
    .getByRole("button", { name: "초기 자료 이관", exact: true })
    .click();
  const dataDir = path.resolve(import.meta.dirname, "../../data");
  const file = fs
    .readdirSync(dataDir)
    .find((n) => n.normalize("NFC") === "자재공임단가.xlsx")!;
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.join(dataDir, file));
  await page.getByRole("button", { name: "원본 업로드 및 시트 확인" }).click();
  await expect(
    page.getByRole("heading", { name: "현재 기준 시트 선택" }),
  ).toBeVisible();
  await page.getByLabel("택배비.포장비").check();
  await page.getByRole("button", { name: "선택 시트 분석" }).click();
  const record = page
    .locator(".import-record")
    .filter({ has: page.getByText("택배비 / 극소", { exact: true }) });
  await expect(record).toBeVisible();
  await record.locator('input[type="checkbox"]').first().check();
  await record.getByRole("button", { name: "연결·변경 확인" }).click();
  await page.getByRole("button", { name: "선택한 1개 항목 반영" }).click();
  await expect(
    page.getByRole("heading", { name: "반영 완료", exact: true }),
  ).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("link", { name: "업로드 원본 다운로드" }).click();
  expect((await downloaded).suggestedFilename().normalize("NFC")).toBe(
    "자재공임단가.xlsx",
  );
});

test("작은 화면·키보드·미저장 이동·새로고침", async ({ page }) => {
  await page.goto("/products");
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("heading", { name: "제품", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/products-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("link", { name: "제품 등록", exact: true }).click();
  await page.getByLabel("디자인", { exact: false }).fill("미저장");
  await page.getByRole("link", { name: "컬러칩", exact: true }).click();
  await expect(
    page.getByText("저장하지 않은 변경사항이 있습니다."),
  ).toBeVisible();
  await page.getByRole("button", { name: "계속 편집" }).click();
  await expect(page.getByLabel("디자인", { exact: false })).toHaveValue(
    "미저장",
  );
  await page.getByRole("link", { name: "컬러칩", exact: true }).click();
  await page.getByRole("button", { name: "변경사항 버리기" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "컬러칩·PSD" })).toBeVisible();
});

test("JPG 교체·PSD 원본 다운로드·색상 공유", async ({ page, request }) => {
  page.on("dialog", (d) => d.accept());
  const product = (await (await request.get(`${api}/products`)).json())
    .items[0];
  await page.goto(`/files?group_id=${product.group_id}`);
  await page.getByRole("button", { name: "자료 업로드" }).click();
  await page.getByLabel("연결 색상", { exact: true }).selectOption("화이트");
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.resolve(import.meta.dirname, "fixtures/color.jpg"));
  await expect(page.getByAltText("업로드 전 새 컬러칩 확인")).toBeVisible();
  await page.getByRole("button", { name: "파일 저장", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "JPG 원본 다운로드" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "JPG 원본 다운로드" }).click();
  expect((await download).suggestedFilename()).toBe("color.jpg");
  await page.getByRole("button", { name: "자료 업로드" }).click();
  await page.getByLabel("연결 색상", { exact: true }).selectOption("화이트");
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.resolve(import.meta.dirname, "fixtures/color.jpg"));
  await expect(page.getByAltText("현재 컬러칩")).toBeVisible();
  await page
    .getByRole("button", { name: "현재 파일 교체", exact: true })
    .click();
  await expect(page.locator(".asset")).toHaveCount(1);
  await page.getByRole("button", { name: "PSD 원본", exact: true }).click();
  await page.getByRole("button", { name: "자료 업로드" }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.resolve(import.meta.dirname, "fixtures/source.psd"));
  await page.getByRole("button", { name: "파일 저장", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "PSD 원본 다운로드" }),
  ).toBeVisible();
});

test("주요 화면 접근성·200% 글자 확대·가로 화면", async ({ page, request }) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const product = (await (await request.get(`${api}/products`)).json())
    .items[0];
  for (const url of [
    "/products",
    `/products/${product.id}/cost`,
    `/groups/${product.group_id}`,
    `/groups/${product.group_id}/sales`,
    "/files",
    "/rates",
    "/imports",
  ]) {
    await page.goto(url);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await expect(page.locator(".skeleton")).toHaveCount(0);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
  await page.goto("/products");
  await page.setViewportSize({ width: 768, height: 375 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/landscape-200-percent.png",
    fullPage: true,
  });
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});

test("취소한 저장은 미저장 상태 유지·충돌 시 입력과 서버 값 비교", async ({
  page,
  request,
}) => {
  const body = {
    name: "충돌 검증 원단",
    category: "원단",
    unit: "yd",
    amount: "1000",
    vat_included: false,
  };
  const original = await (
    await request.post(`${api}/rates`, { data: body })
  ).json();
  await page.goto("/rates");
  await page
    .getByRole("row")
    .filter({ hasText: "충돌 검증 원단" })
    .getByRole("button", { name: "편집" })
    .click();
  await page.getByLabel("단가(원)").fill("1200");
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "단가 변경 및 재계산" }).click();
  await expect(page.getByText("저장했습니다.", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "컬러칩", exact: true }).click();
  await expect(
    page.getByText("저장하지 않은 변경사항이 있습니다."),
  ).toBeVisible();
  await page.getByRole("button", { name: "계속 편집" }).click();
  const changed = await request.put(`${api}/rates/${original.id}`, {
    data: { ...body, amount: "1500", version: original.version },
  });
  expect(changed.ok()).toBeTruthy();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "단가 변경 및 재계산" }).click();
  await expect(
    page.getByText("서버의 현재 값과 비교", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("단가(원)")).toHaveValue("1200");
  await expect(page.locator("details.warning")).toContainText("1500");
});
