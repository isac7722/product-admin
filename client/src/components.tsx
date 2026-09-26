import {
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { Icon } from "./icons";
import { Link } from "react-router-dom";
import { DirtyContext } from "./navigation";
import { ApiError, api, date, labels, money, useData, type Doc } from "./api";

export function ErrorBox({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return message ? (
    <div className="error" role="alert">
      <strong>확인이 필요합니다</strong>
      <p>{message}</p>
      {retry && (
        <button type="button" onClick={retry}>
          다시 불러오기
        </button>
      )}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="skeleton" role="status">
      <Icon name="spinner" className="loading-icon" />
      불러오는 중…
    </div>
  );
}
export function Empty({
  children = "등록된 정보가 없습니다.",
  action,
}: {
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden>
        <Icon name="inbox" size={26} />
      </span>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Header({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1 tabIndex={-1}>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function Field({
  name,
  value,
  onChange,
  label,
  required = false,
  multiline = false,
  type = "text",
  options,
  disabled = false,
}: {
  name: string;
  value: any;
  onChange: (v: any) => void;
  label?: string;
  required?: boolean;
  multiline?: boolean;
  type?: string;
  options?: { value: string; label: string }[];
  disabled?: boolean;
}) {
  const id = `field-${name}`;
  return (
    <label className={`field ${multiline ? "wide" : ""}`} htmlFor={id}>
      <span>
        {label ?? labels[name] ?? name}
        {required && <span className="required"> *</span>}
      </span>
      {options ? (
        <select
          id={id}
          aria-label={label ?? labels[name] ?? name}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
        >
          <option value="">선택해 주세요</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : type === "checkbox" ? (
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      ) : multiline ? (
        <textarea
          id={id}
          rows={4}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      ) : (
        <input
          id={id}
          aria-label={label ?? labels[name] ?? name}
          type={type}
          min={type === "number" ? "0" : undefined}
          step={type === "number" ? "any" : undefined}
          value={value ?? ""}
          required={required}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
export function SaveForm({
  onSave,
  children,
  cancel,
  dirty = true,
  label = "저장",
}: {
  onSave: () => Promise<void | boolean>;
  children: ReactNode;
  cancel?: () => void;
  dirty?: boolean;
  label?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false);
  const [conflict, setConflict] = useState<Doc | null>(null);
  const register = useContext(DirtyContext),
    formId = useId();
  useEffect(() => {
    register(formId, dirty && !success && !busy);
    return () => register(formId, false);
  }, [register, formId, dirty, success, busy]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setConflict(null);
    setSuccess(false);
    try {
      const saved = await onSave();
      if (saved !== false) setSuccess(true);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError) setConflict(e.current || null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} onChange={() => setSuccess(false)}>
      {children}
      <ErrorBox message={error} />
      {conflict && (
        <details className="warning" open>
          <summary>서버의 현재 값과 비교</summary>
          <p>
            작성 중인 입력은 위에 유지되어 있습니다. 현재 값을 확인한 후 필요한
            내용을 복사하고 화면을 다시 불러오세요.
          </p>
          <dl className="detail-grid">
            {Object.entries(conflict.spec || conflict)
              .filter(
                ([key, value]) =>
                  labels[key] && (typeof value !== "object" || value === null),
              )
              .map(([key, value]) => (
                <div key={key}>
                  <dt>{labels[key]}</dt>
                  <dd>{value == null ? "미등록" : String(value)}</dd>
                </div>
              ))}
          </dl>
          {conflict.details?.map((line: any, index: number) => (
            <p key={index}>
              {line.name} · 소요량 {line.quantity} · {money(line.amount)}원
            </p>
          ))}
        </details>
      )}
      {success && (
        <p role="status" className="success">
          저장했습니다.
        </p>
      )}
      <div className="form-actions">
        {cancel && (
          <button
            type="button"
            onClick={() => {
              if (!dirty || window.confirm("변경사항을 버리고 닫을까요?"))
                cancel();
            }}
          >
            취소
          </button>
        )}
        <button className="primary" disabled={busy} type="submit">
          {busy ? "저장 중…" : label}
        </button>
      </div>
    </form>
  );
}
export function Source({ source }: { source: any }) {
  return source ? (
    <p className="source">
      출처:{" "}
      <a href={`/api/files/${source.file_id}/download`}>업로드 원본 다운로드</a>{" "}
      · {source.sheet} · {source.cell}
    </p>
  ) : null;
}
function historyValue(key: string, value: any) {
  if (key === "status") return value ?? "미등록";
  if (key === "vat_included") return value ? "포함" : "별도";
  if (key === "margin_rate")
    return value == null ? "계산 불가" : `${money(Number(value) * 100)}%`;
  return money(value);
}
export function History({ id }: { id: string }) {
  const { data, loading, error, reload } = useData<Doc[]>(`/history/${id}`, []);
  return (
    <section className="section">
      <h2>
        금액 변경 이력 <small>Asia/Seoul</small>
      </h2>
      <ErrorBox message={error} retry={reload} />
      {loading ? (
        <Loading />
      ) : data.length === 0 ? (
        <p className="muted">
          아직 변경 이력이 없습니다. 최초 등록은 기준값으로 보관합니다.
        </p>
      ) : (
        data.map((h) => (
          <article className="history-item" key={h.id}>
            <p>
              <strong>{h.reason}</strong> · {date(h.created_at)}
            </p>
            <dl className="history-values">
              {Object.entries(h.changes).map(([key, value]: [string, any]) => (
                <div key={key}>
                  <dt>{labels[key] ?? key}</dt>
                  <dd>
                    {historyValue(key, value.before)} →{" "}
                    {historyValue(key, value.after)}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))
      )}
    </section>
  );
}
export function ProductPicker({
  value,
  onChange,
  label = "제품 선택",
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const { data } = useData<{ items: Doc[] }>(
    `/products?limit=100&q=${encodeURIComponent(query)}`,
    { items: [] },
  );
  const [selected, setSelected] = useState<Doc | null>(null);
  useEffect(() => {
    if (value)
      void api<Doc>(`/products/${value}`)
        .then(setSelected)
        .catch(() => setSelected(null));
    else setSelected(null);
  }, [value]);
  const rows =
    selected && !data.items.some((p) => p.id === selected.id)
      ? [selected, ...data.items]
      : data.items;
  return (
    <div className="picker">
      <label>
        <span>{label} 검색</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="제품코드·디자인 검색"
        />
      </label>
      <label>
        <span>{label}</span>
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">선택해 주세요</option>
          {rows.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.design} · {p.product_type}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
export function ProductTable({ products }: { products: Doc[] }) {
  return (
    <div className="table-wrap">
      <table className="product-table">
        <caption className="sr-only">제품 목록</caption>
        <thead>
          <tr>
            <th>제품코드</th>
            <th>디자인</th>
            <th>제품 종류</th>
            <th>색상</th>
            <th>사이즈</th>
            <th>관련 자료</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td data-label="제품코드">
                <Link className="code" to={`/products/${p.id}`}>
                  {p.code}
                </Link>
              </td>
              <td data-label="디자인">{p.design}</td>
              <td data-label="종류">{p.product_type}</td>
              <td data-label="색상">{p.color}</td>
              <td data-label="사이즈">{p.size}</td>
              <td data-label="관련 자료">
                <Link to={`/groups/${p.group_id}`}>기술서</Link>
                <span className="separator">·</span>
                <Link to={`/products/${p.id}/cost`}>원가</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
