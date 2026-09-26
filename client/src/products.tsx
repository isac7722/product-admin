import { Icon } from "./icons";
import { useEffect, useState } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { categories, labels, money, send, useData, type Doc } from "./api";
import { SizeSelect, SizeSettingsDialog, type SizeOption } from "./sizes";
import {
  Empty,
  ErrorBox,
  Field,
  Header,
  History,
  Loading,
  SaveForm,
  Source,
} from "./components";

export function Products() {
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    sessionStorage.setItem("product-list-url", `/products?${params}`);
  }, [params]);
  const { data, error, loading, reload } = useData<any>(`/catalog?${params}`, {
    items: [],
    total: 0,
    filters: {},
  });
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set("page", "1");
    value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: true });
  };
  const page = Number(params.get("page") || 1);
  return (
    <>
      <Header
        title="제품"
        description="디자인부터 색상·사이즈까지, 제품과 연결된 자료를 한곳에서 관리합니다."
        action={
          <Link className="button primary" to="/products/new">
            <Icon name="plus" size={18} /> 제품 등록
          </Link>
        }
      />
      <section className="panel">
        <div className="filters">
          <label className="search">
            <span>제품 검색</span>
            <input
              placeholder="제품코드 또는 디자인명 검색"
              value={params.get("q") || ""}
              onChange={(e) => change("q", e.target.value)}
            />
          </label>
          {["product_type", "color", "size"].map((key) => (
            <label key={key}>
              <span>{labels[key]}</span>
              <select
                value={params.get(key) || ""}
                onChange={(e) => change(key, e.target.value)}
              >
                <option value="">전체</option>
                {(data.filters[key] || []).map((v: string) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          ))}
          <button onClick={() => setParams({})}>초기화</button>
        </div>
        <div className="list-heading">
          <strong>전체 {data.total.toLocaleString()}개</strong>
          <span className="muted">디자인별 모아 보기 · 25개씩 보기</span>
        </div>
        <ErrorBox message={error} retry={reload} />
        {loading && <Loading />}
        {data.items.length > 0 ? (
          <div className="table-wrap">
            <table className="product-table catalog-table">
              <caption className="sr-only">디자인별 제품 목록</caption>
              <thead>
                <tr>
                  <th>제품</th>
                  <th>종류</th>
                  <th>전체 등록 컬러</th>
                  <th>전체 등록 사이즈</th>
                  <th>등록 조합</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item: Doc) => {
                  const selection = new URLSearchParams({
                    group: item.match_group_id,
                  });
                  if (item.match_product_id)
                    selection.set("product", item.match_product_id);
                  return (
                    <tr key={item.id}>
                      <td data-label="제품">
                        <Link
                          className="catalog-name"
                          to={`/catalog/${item.id}?${selection}`}
                        >
                          {item.design}
                        </Link>
                      </td>
                      <td data-label="종류">
                        {item.product_types.join(" · ")}
                      </td>
                      <td data-label="컬러">
                        <strong>{item.colors.length}개</strong>
                        <small>{item.colors.join(" · ")}</small>
                      </td>
                      <td data-label="사이즈">{item.sizes.join(" · ")}</td>
                      <td data-label="등록 조합">{item.variant_count}개</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && (
            <Empty
              action={
                <Link to="/products/new">
                  첫 제품 등록하기 <Icon name="arrow" size={16} />
                </Link>
              }
            >
              {params.get("q") ||
              params.get("color") ||
              params.get("product_type") ||
              params.get("size")
                ? "조건에 맞는 제품이 없습니다."
                : "등록된 제품이 없습니다."}
            </Empty>
          )
        )}
        <nav className="pagination" aria-label="제품 페이지">
          <button
            disabled={page <= 1}
            onClick={() =>
              setParams({
                ...Object.fromEntries(params),
                page: String(page - 1),
              })
            }
          >
            이전
          </button>
          <span>
            {page} / {Math.max(1, Math.ceil(data.total / 25))}
          </span>
          <button
            disabled={page * 25 >= data.total}
            onClick={() =>
              setParams({
                ...Object.fromEntries(params),
                page: String(page + 1),
              })
            }
          >
            다음
          </button>
        </nav>
      </section>
    </>
  );
}
const newProduct = {
  design: "",
  product_type: "",
  prefix: "",
  color: "",
  size: "",
  dimensions: "",
  notes: "",
};
export function ProductEditor({
  original,
  onSaved,
}: {
  original?: Doc;
  onSaved?: () => void;
}) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [value, setValue] = useState<any>(() => ({
    ...newProduct,
    ...Object.fromEntries(
      Object.keys(newProduct).map((k) => [
        k,
        original?.[k] ?? params.get(k) ?? "",
      ]),
    ),
  }));
  const { data: groups } = useData<Doc[]>("/groups", []);
  const sizes = useData<SizeOption[]>("/sizes", []);
  const dimensions = useData<SizeOption[]>("/dimensions", []);
  const [manageSizes, setManageSizes] = useState(false);
  const [manageDimensions, setManageDimensions] = useState(false);
  const set = (key: string, val: string) =>
    setValue((v: any) => {
      const next = { ...v, [key]: val };
      const group = groups.find(
        (g) => g.design === next.design && g.product_type === next.product_type,
      );
      if (group && key !== "prefix") next.prefix = group.prefix;
      return next;
    });
  return (
    <>
      {original ? (
        <h2>제품정보 수정</h2>
      ) : (
        <Header
          title="제품 등록"
          description="같은 디자인의 제품은 목록에서 함께 표시됩니다. 종류·색상·사이즈 조합별로 등록하세요."
        />
      )}
      <section className="panel form-panel">
        <SaveForm
          dirty={Object.keys(newProduct).some(
            (k) => value[k] !== (original?.[k] ?? ""),
          )}
          onSave={async () => {
            const selectedSize = sizes.data.find((s) => s.name === value.size);
            const selectedDimension = dimensions.data.find(
              (s) => s.name === value.dimensions,
            );
            if (
              value.dimensions &&
              (dimensions.loading ||
                dimensions.error ||
                !selectedDimension ||
                (!selectedDimension.active &&
                  original?.dimensions !== value.dimensions))
            )
              throw new Error(
                "상세 규격 목록을 확인하고 등록된 항목을 선택하세요.",
              );
            if (
              sizes.loading ||
              sizes.error ||
              !selectedSize ||
              (!selectedSize.active && original?.size !== value.size)
            )
              throw new Error(
                "사이즈 목록을 확인하고 등록된 사이즈를 선택하세요.",
              );
            if (
              original &&
              ["design", "product_type", "prefix", "color", "size"].some(
                (k) => value[k] !== original[k],
              ) &&
              !window.confirm(
                `제품코드가 ${value.prefix}-${value.color}-${value.size}(으)로 변경됩니다. 디자인·종류·prefix 변경은 기술서 전체, 색상명 변경은 동일 색상의 모든 사이즈와 자료에 적용됩니다. 저장할까요?`,
              )
            )
              return false;
            const result = await send(
              original ? `/products/${original.id}` : "/products",
              {
                ...value,
                size_id: selectedSize.id,
                dimensions_id: selectedDimension?.id ?? null,
                version: original?.version,
              },
              original ? "PUT" : "POST",
            );
            onSaved?.();
            navigate(
              `/catalog/${result.group_id}?group=${result.group_id}&product=${result.id}`,
            );
          }}
          cancel={() =>
            navigate(
              original
                ? `/catalog/${original.group_id}?group=${original.group_id}&product=${original.id}`
                : params.get("group_id")
                  ? `/catalog/${params.get("group_id")}`
                  : "/products",
            )
          }
        >
          <h2>제품 식별정보</h2>
          <div className="form-grid">
            {Object.keys(newProduct).map((key) =>
              key === "size" ? (
                <div key={key} className="size-field">
                  <SizeSelect
                    sizes={sizes.data}
                    value={value.size}
                    onChange={(v) => set("size", v)}
                    originalSize={original?.size}
                    disabled={sizes.loading || !!sizes.error}
                  />
                  {sizes.loading && <p role="status">사이즈 불러오는 중…</p>}
                  <ErrorBox message={sizes.error} retry={sizes.reload} />
                  <button type="button" onClick={() => setManageSizes(true)}>
                    사이즈 설정
                  </button>
                </div>
              ) : key === "dimensions" ? (
                <div key={key} className="size-field">
                  <SizeSelect
                    kind="dimensions"
                    sizes={dimensions.data}
                    value={value.dimensions}
                    onChange={(v) => set("dimensions", v)}
                    originalSize={original?.dimensions}
                    required={false}
                    disabled={dimensions.loading || !!dimensions.error}
                  />
                  {dimensions.loading && (
                    <p role="status">상세 규격 불러오는 중…</p>
                  )}
                  <ErrorBox
                    message={dimensions.error}
                    retry={dimensions.reload}
                  />
                  <button
                    type="button"
                    onClick={() => setManageDimensions(true)}
                  >
                    상세 규격 설정
                  </button>
                </div>
              ) : (
                <Field
                  key={key}
                  name={key}
                  value={value[key]}
                  onChange={(v) => set(key, v)}
                  required={!["dimensions", "notes"].includes(key)}
                  multiline={key === "notes"}
                />
              ),
            )}
          </div>
          <div className="notice">
            <span>생성될 제품코드</span>
            <strong className="code">
              {value.prefix || "prefix"}-{value.color || "색상"}-
              {value.size || "사이즈"}
            </strong>
            <p>
              Q/K 겸용 실물은 하나의 제품으로 등록합니다. 이름에 하이픈(-)은
              사용할 수 없습니다.
            </p>
          </div>
        </SaveForm>
      </section>
      {manageSizes && (
        <SizeSettingsDialog
          onClose={() => {
            setManageSizes(false);
            sizes.reload();
          }}
          onChanged={sizes.reload}
        />
      )}
      {manageDimensions && (
        <SizeSettingsDialog
          kind="dimensions"
          onClose={() => {
            setManageDimensions(false);
            dimensions.reload();
          }}
          onChanged={dimensions.reload}
        />
      )}
    </>
  );
}
export function ProductLayout() {
  const { id } = useParams();
  const location = useLocation();
  const state = useData<Doc | null>(`/products/${id}`, null);
  if (state.error)
    return <ErrorBox message={state.error} retry={state.reload} />;
  if (!state.data || state.data.id !== id) return <Loading />;
  const product = state.data;
  const editing = location.pathname.endsWith("/edit");
  return (
    <Navigate
      replace
      to={`/catalog/${product.group_id}${editing ? "/edit" : ""}?group=${product.group_id}&product=${product.id}${location.pathname.endsWith("/cost") ? "#variant-cost" : ""}`}
    />
  );
}
export function ProductInfo() {
  const { product } = useOutletContext<{ product: Doc }>();
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>제품정보</h2>
        <div className="inline">
          <button onClick={() => navigator.clipboard.writeText(product.code)}>
            <Icon name="copy" size={16} /> 코드 복사
          </button>
          <Link
            className="button"
            to={`edit?group=${product.group_id}&product=${product.id}`}
          >
            편집
          </Link>
        </div>
      </div>
      <p className="code">{product.code}</p>
      <dl className="detail-grid">
        {Object.keys(newProduct).map((k) => (
          <div key={k}>
            <dt>{labels[k]}</dt>
            <dd>{product[k] || "미등록"}</dd>
          </div>
        ))}
      </dl>
      <Source source={product.source} />
      <div className="notice">
        상품기술서와 전체 컬러칩은{" "}
        <strong>
          {product.design} · {product.product_type}
        </strong>
        의 모든 색상·사이즈가 공유합니다.
      </div>
    </section>
  );
}
export function EditProduct() {
  const { product, reload } = useOutletContext<{
    product: Doc | null;
    reload: () => void;
  }>();
  if (!product) return <Empty>위에서 수정할 컬러·사이즈를 선택하세요.</Empty>;
  return <ProductEditor key={product.id} original={product} onSaved={reload} />;
}

export const blankCost = {
  lines: [] as any[],
  sale_price: "",
  shipping_rate_id: "",
  packaging_rate_id: "",
  unresolved_inputs: [] as string[],
};
export function CostInputs({
  value,
  setValue,
  rates,
  prefix = "cost",
}: {
  value: any;
  setValue: (v: any) => void;
  rates: Doc[];
  prefix?: string;
}) {
  const changeLine = (index: number, key: string, val: any) =>
    setValue({
      ...value,
      lines: value.lines.map((l: any, i: number) =>
        i === index ? { ...l, [key]: val } : l,
      ),
    });
  return (
    <>
      <h2>생산 원가 항목</h2>
      <p className="muted">
        원단 기본금액 = 단가 × 소요량 · 로스금액 = 기본금액 × 7% · VAT 별도
        단가에는 10%를 더합니다.
      </p>
      {value.lines.map((line: any, i: number) => (
        <div className="cost-line" key={i}>
          <Field
            name={`${prefix}-rate-${i}`}
            label="자재·공임"
            value={line.rate_id}
            required
            onChange={(id) => {
              const rate = rates.find((r) => r.id === id);
              setValue({
                ...value,
                lines: value.lines.map((l: any, j: number) =>
                  j === i
                    ? {
                        ...l,
                        rate_id: id,
                        loss_rate: rate?.category === "원단" ? "0.07" : "0",
                      }
                    : l,
                ),
              });
            }}
            options={rates
              .filter((r) => !["택배비", "포장비"].includes(r.category))
              .map((r) => ({
                value: r.id,
                label: `${r.name} · ${money(r.amount)}원/${r.unit} · VAT ${r.vat_included ? "포함" : "별도"}`,
              }))}
          />
          <Field
            name={`${prefix}-quantity-${i}`}
            label="소요량"
            value={line.quantity}
            type="number"
            required
            onChange={(v) => changeLine(i, "quantity", v)}
          />
          <Field
            name={`${prefix}-loss-${i}`}
            label="로스율 (0.07 = 7%)"
            type="number"
            value={line.loss_rate}
            onChange={(v) => changeLine(i, "loss_rate", v)}
          />
          <button
            type="button"
            onClick={() =>
              setValue({
                ...value,
                lines: value.lines.filter((_: any, j: number) => i !== j),
              })
            }
            aria-label={`원가 항목 ${i + 1} 제거`}
          >
            제거
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          setValue({
            ...value,
            lines: [
              ...value.lines,
              { rate_id: "", quantity: "1", loss_rate: "0", label: "" },
            ],
          })
        }
      >
        <Icon name="plus" size={18} /> 원가 항목 추가
      </button>
      <h2 className="section">판매가·배송 비용</h2>
      <div className="form-grid">
        <Field
          name={`${prefix}-sale_price`}
          label="상시할인가(원)"
          type="number"
          value={value.sale_price}
          onChange={(v) => setValue({ ...value, sale_price: v })}
        />
        {[
          ["shipping_rate_id", "택배비"],
          ["packaging_rate_id", "포장비"],
        ].map(([key, cat]) => (
          <Field
            key={key}
            name={`${prefix}-${key}`}
            label={cat}
            value={value[key]}
            onChange={(v) => setValue({ ...value, [key]: v })}
            options={rates
              .filter((r) => r.category === cat)
              .map((r) => ({
                value: r.id,
                label: `${r.name} · ${money(r.amount)}원`,
              }))}
          />
        ))}
      </div>
      {!!value.unresolved_inputs?.length && (
        <div className="warning">
          <strong>확인할 원가 근거</strong>
          {value.unresolved_inputs.map((message: string, i: number) => (
            <label className="check" key={i}>
              <input
                type="checkbox"
                onChange={() =>
                  setValue({
                    ...value,
                    unresolved_inputs: value.unresolved_inputs.filter(
                      (_: string, j: number) => j !== i,
                    ),
                  })
                }
              />
              {message} — 위 항목에서 연결·수량을 확인한 후 체크
            </label>
          ))}
        </div>
      )}
    </>
  );
}
export const costPayload = (value: any, version?: number) => ({
  ...value,
  version,
  sale_price: value.sale_price === "" ? null : value.sale_price,
  shipping_rate_id: value.shipping_rate_id || null,
  packaging_rate_id: value.packaging_rate_id || null,
});
export function CostPage() {
  const { product } = useOutletContext<{ product: Doc }>();
  const state = useData<Doc | null>(`/products/${product.id}/cost`, null);
  const { data: rates } = useData<Doc[]>("/rates", []);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<any>(blankCost);
  const start = () => {
    setValue(
      Object.fromEntries(
        Object.keys(blankCost).map((k) => [
          k,
          state.data?.[k] ?? (blankCost as any)[k],
        ]),
      ),
    );
    setEditing(true);
  };
  const cost = state.data;
  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <h2>원가·판매가</h2>
          {!editing && (
            <button
              className="primary"
              disabled={state.loading || !!state.error}
              onClick={start}
            >
              원가·판매가 {cost ? "편집" : "등록"}
            </button>
          )}
        </div>
        <ErrorBox message={state.error} retry={state.reload} />
        {editing ? (
          <SaveForm
            onSave={async () => {
              await send(
                `/products/${product.id}/cost`,
                costPayload(value, cost?.version),
                "PUT",
              );
              setEditing(false);
              state.reload();
            }}
            cancel={() => setEditing(false)}
          >
            <CostInputs value={value} setValue={setValue} rates={rates} />
          </SaveForm>
        ) : state.loading ? (
          <Loading />
        ) : !cost ? (
          <Empty>
            원가가 등록되지 않았습니다. 단가와 소요량을 연결해 주세요.
          </Empty>
        ) : (
          <>
            <div className="metrics">
              {[
                "production_cost",
                "sale_price",
                "normal_price",
                "margin",
                "margin_rate",
              ].map((key) => (
                <div key={key}>
                  <span>{labels[key]}</span>
                  <strong>
                    {cost[key] == null
                      ? "계산 확인 필요"
                      : key === "margin_rate"
                        ? `${money(Number(cost[key]) * 100)}%`
                        : `${money(cost[key])}원`}
                  </strong>
                </div>
              ))}
            </div>
            {!!cost.issues.length && (
              <div className="warning">
                <strong>계산 확인 필요</strong>
                <p>{cost.issues.join(" · ")}</p>
              </div>
            )}
            <h3>계산 근거</h3>
            <div
              className="table-wrap"
              tabIndex={0}
              aria-label="원가 근거 표, 좁은 화면에서 가로 스크롤"
            >
              <table>
                <thead>
                  <tr>
                    <th>항목</th>
                    <th>단가</th>
                    <th>소요량</th>
                    <th>로스금액</th>
                    <th>VAT</th>
                    <th>원가(원)</th>
                  </tr>
                </thead>
                <tbody>
                  {cost.details.map((d: any, i: number) => (
                    <tr key={i}>
                      <td>{d.name}</td>
                      <td className="number">{money(d.unit_price)}</td>
                      <td className="number">{d.quantity}</td>
                      <td className="number">{money(d.loss_amount)}</td>
                      <td>{d.vat_included ? "포함" : "별도 10%"}</td>
                      <td className="number">{money(d.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">
              수수료 20% · 할인율 40% · 불량률 1% 고정. 단가가 변경되어도
              상시할인가는 유지됩니다.
            </p>
            <dl className="detail-grid">
              {[
                ["수수료", "fee"],
                ["택배비", "shipping"],
                ["포장비", "packaging"],
                ["부가세 계산액", "vat"],
                ["불량 비용", "defect"],
              ].map(([label, key]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{money(cost[key])}원</dd>
                </div>
              ))}
            </dl>
            <Source source={cost.source} />
            <a
              className="button"
              href={`/api/groups/${product.group_id}/export?color=${encodeURIComponent(product.color)}`}
            >
              최신 원가계산서 XLSX 다운로드
            </a>
          </>
        )}
      </section>
      <History key={cost?.updated_at} id={product.id} />
    </>
  );
}

const blankRate = {
  name: "",
  category: "원단",
  unit: "yd",
  amount: "",
  vat_included: false,
  conditions: "",
  supplier: "",
  notes: "",
};
export function Rates() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const state = useData<Doc[]>(
    `/rates?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}`,
    [],
  );
  const [edit, setEdit] = useState<Doc | null | undefined>(undefined),
    [value, setValue] = useState<any>(blankRate),
    [history, setHistory] = useState("");
  const start = (r: Doc | null) => {
    setEdit(r);
    setValue(
      Object.fromEntries(
        Object.keys(blankRate).map((k) => [k, r?.[k] ?? (blankRate as any)[k]]),
      ),
    );
  };
  return (
    <>
      <Header
        title="자재·공임 단가"
        description="원단부터 포장비까지, 계산의 기준이 되는 단가를 관리합니다."
        action={
          <button className="primary" onClick={() => start(null)}>
            <Icon name="plus" size={18} /> 단가 등록
          </button>
        }
      />
      {edit !== undefined && (
        <section className="panel form-panel">
          <h2>{edit ? "단가 수정" : "단가 등록"}</h2>
          <SaveForm
            onSave={async () => {
              if (
                edit &&
                !window.confirm(
                  `단가 ${money(edit.amount)}원 → ${money(value.amount)}원 / 영향 제품 ${edit.affected_products.length}개. 변경 및 재계산할까요?`,
                )
              )
                return false;
              await send(
                edit ? `/rates/${edit.id}` : "/rates",
                {
                  ...value,
                  amount: value.amount === "" ? null : value.amount,
                  version: edit?.version,
                },
                edit ? "PUT" : "POST",
              );
              setEdit(undefined);
              state.reload();
            }}
            cancel={() => setEdit(undefined)}
            label={edit ? "단가 변경 및 재계산" : "저장"}
          >
            <div className="form-grid">
              {Object.keys(blankRate).map((key) => (
                <Field
                  key={key}
                  name={key}
                  value={value[key]}
                  onChange={(v) => setValue({ ...value, [key]: v })}
                  required={["name", "category", "unit"].includes(key)}
                  type={
                    key === "amount"
                      ? "number"
                      : key === "vat_included"
                        ? "checkbox"
                        : "text"
                  }
                  multiline={key === "notes"}
                  options={
                    key === "category"
                      ? categories.map((c) => ({ value: c, label: c }))
                      : undefined
                  }
                />
              ))}
            </div>
            {edit && (
              <div className="notice">
                이 단가를 사용하는 제품{" "}
                <strong>{edit.affected_products.length}개</strong>의 원가·마진을
                함께 재계산합니다.
                <div>
                  {edit.affected_products.map((id: string) => (
                    <Link key={id} to={`/products/${id}/cost`}>
                      영향 제품 원가 보기{" "}
                      <Icon name="external" size={14} />{" "}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </SaveForm>
        </section>
      )}
      <section className="panel">
        <div className="filters">
          <label className="search">
            <span>단가 검색</span>
            <input
              placeholder="명칭·적용 조건 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            <span>구분</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">전체</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <ErrorBox message={state.error} retry={state.reload} />
        {state.loading ? (
          <Loading />
        ) : !state.data.length ? (
          <Empty>등록된 단가가 없습니다.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>명칭·조건</th>
                  <th>구분</th>
                  <th>단가(원)</th>
                  <th>단위·VAT</th>
                  <th>영향 제품</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      <small>{r.conditions}</small>
                      <Source source={r.source} />
                    </td>
                    <td>{r.category}</td>
                    <td className="number">{money(r.amount)}</td>
                    <td>
                      {r.unit} · {r.vat_included ? "포함" : "별도"}
                    </td>
                    <td>{r.affected_products.length}개</td>
                    <td>
                      <button onClick={() => start(r)}>편집</button>{" "}
                      <button onClick={() => setHistory(r.id)}>이력</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {history && (
        <History
          key={state.data.find((r) => r.id === history)?.updated_at}
          id={history}
        />
      )}
    </>
  );
}
