import { useEffect, useState } from "react";

export type Doc = { id: string; version: number; [key: string]: any };
export class ApiError extends Error {
  current?: Doc;
  constructor(message: string, current?: Doc) {
    super(message);
    this.current = current;
  }
}
export async function api<T = any>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers:
      options?.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options?.headers },
  });
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ detail: "서버 응답을 확인할 수 없습니다." }));
    const detail = body.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map(
                (e: any) =>
                  `${e.field ?? e.loc?.join(".")}: ${e.message ?? e.msg}`,
              )
              .join("\n")
          : (detail?.message ?? "요청을 처리하지 못했습니다.");
    throw new ApiError(message, detail?.current);
  }
  return response.json();
}
export const send = (path: string, data: any, method = "POST") =>
  api(path, { method, body: JSON.stringify(data) });
export function useData<T = any>(path: string, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<T>(path, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision]);
  return {
    data,
    setData,
    error,
    loading,
    reload: () => setRevision((v) => v + 1),
  };
}
export function money(value: any) {
  return value == null || value === ""
    ? "미등록"
    : Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}
export function date(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour12: false,
  });
}
export const labels: Record<string, string> = {
  design: "디자인",
  product_type: "제품 종류",
  prefix: "코드 prefix",
  color: "색상",
  size: "사이즈",
  dimensions: "상세 규격(cm)",
  notes: "비고",
  name: "명칭",
  category: "구분",
  unit: "단위",
  amount: "단가(원)",
  vat_included: "VAT 포함",
  conditions: "적용 조건·규격",
  supplier: "업체",
  name_ko: "상품명(한글)",
  name_en: "상품명(영문)",
  front_material: "앞 원단·소재",
  back_material: "뒤 원단·소재",
  filling: "충전재",
  country: "제조국",
  keywords: "키워드",
  description: "제품 설명",
  color_details: "색상 상세·앞뒤·참고 정보",
  front_color: "앞 색상",
  back_color: "뒤 색상",
  sale_price: "상시할인가",
  normal_price: "정상판매가",
  production_cost: "VAT 포함 원가",
  margin: "마진",
  margin_rate: "마진율",
  shipping_rate_id: "택배비",
  packaging_rate_id: "포장비",
  lines: "원가 항목",
  items: "연결 제품·촬영 지시",
  status: "계산 상태",
  source: "출처",
  unresolved_inputs: "확인할 원가 근거",
};
export const categories = [
  "원단",
  "솜",
  "부자재",
  "제작공임",
  "택배비",
  "포장비",
  "기타",
];
