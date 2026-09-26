import { Icon } from "./icons";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  categories,
  date,
  labels,
  money,
  send,
  useData,
  type Doc,
} from "./api";
import {
  Empty,
  ErrorBox,
  Field,
  Header,
  Loading,
  ProductPicker,
  SaveForm,
} from "./components";
import { CostInputs } from "./products";
import { SizeSelect, SizeSettingsDialog, type SizeOption } from "./sizes";

const kinds: Record<string, string> = {
  rates: "자재·공임 단가",
  products: "제품",
  spec: "상품기술서",
  shooting: "촬영구성",
  costs: "원가계산서",
  reference: "참고용·원본 보관",
};
export function Imports() {
  const state = useData<Doc[]>("/imports", []);
  const navigate = useNavigate();
  const [mode, setMode] = useState("operation"),
    [file, setFile] = useState<File | null>(null);
  return (
    <>
      <Header
        title="엑셀 가져오기"
        description="원본을 보관하고, 현재 값과 비교한 뒤 선택한 변경만 반영합니다."
      />
      <section className="panel form-panel">
        <h2>새 가져오기</h2>
        <div className="segmented">
          <button
            aria-pressed={mode === "operation"}
            onClick={() => setMode("operation")}
          >
            운영 중 등록·수정
          </button>
          <button
            aria-pressed={mode === "migration"}
            onClick={() => setMode("migration")}
          >
            초기 자료 이관
          </button>
        </div>
        <p className="muted">
          {mode === "migration"
            ? "기존 자료의 현재 기준 시트를 선택해 이관합니다. 과거 시트는 원본으로 보관합니다."
            : "상품기술서·단가표·원가계산서의 지원 양식을 업로드하세요."}
        </p>
        <SaveForm
          dirty={!!file}
          label="원본 업로드 및 시트 확인"
          onSave={async () => {
            if (!file) throw new Error("XLSX 파일을 선택하세요.");
            const body = new FormData();
            body.set("file", file);
            body.set("mode", mode);
            const job = await api("/imports", { method: "POST", body });
            navigate(`/imports/${job.id}`);
          }}
        >
          <label className="upload-zone">
            엑셀 원본 선택
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <span>
              XLSX · 최대 50MB · 업로드만으로 기존 값이 바뀌지 않습니다.
            </span>
          </label>
        </SaveForm>
      </section>
      <section className="panel">
        <h2>가져오기 내역</h2>
        <ErrorBox message={state.error} retry={state.reload} />
        {state.loading ? (
          <Loading />
        ) : !state.data.length ? (
          <Empty>업로드한 엑셀이 없습니다.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>원본 파일</th>
                  <th>진행 상태</th>
                  <th>업로드 시각 (Asia/Seoul)</th>
                  <th>원본</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <Link to={`/imports/${j.id}`}>{j.name}</Link>
                      <small>
                        {j.mode === "migration" ? "초기 이관" : "운영 가져오기"}
                      </small>
                    </td>
                    <td>
                      <span className="badge">{j.status}</span>
                    </td>
                    <td>{date(j.created_at)}</td>
                    <td>
                      <a href={`/api/files/${j.file_id}/download`}>
                        원본 다운로드
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
export function ImportDetail() {
  const { id } = useParams();
  const state = useData<Doc | null>(`/imports/${id}`, null);
  const sizes = useData<SizeOption[]>("/sizes", []);
  const dimensions = useData<SizeOption[]>("/dimensions", []);
  const [manageSizes, setManageSizes] = useState(false);
  const [manageDimensions, setManageDimensions] = useState(false);
  const { data: groups } = useData<Doc[]>("/groups", []),
    { data: rates } = useData<Doc[]>("/rates", []);
  const [sheets, setSheets] = useState<string[]>([]),
    [context, setContext] = useState({
      design: "",
      product_type: "",
      prefix: "",
      color: "",
      group_id: "",
    });
  const [choices, setChoices] = useState<Record<string, any>>({});
  if (state.error)
    return <ErrorBox message={state.error} retry={state.reload} />;
  if (!state.data) return <Loading />;
  const job = state.data;
  const groupChange = (group_id: string) => {
    const g = groups.find((g) => g.id === group_id);
    setContext({
      ...context,
      group_id,
      design: g?.design || "",
      product_type: g?.product_type || "",
      prefix: g?.prefix || "",
    });
  };
  return (
    <>
      <Link className="back" to="/imports">
        <Icon name="back" size={16} /> 가져오기 내역
      </Link>
      <Header
        title={
          job.mode === "migration" ? "초기 자료 이관" : "엑셀 비교·선택 반영"
        }
        description={job.name}
        action={
          <a className="button" href={`/api/files/${job.file_id}/download`}>
            업로드 원본 다운로드
          </a>
        }
      />
      <ol className="steps">
        <li className="done">1. 원본 보관</li>
        <li className={job.records.length ? "done" : "active"}>
          2. 시트·연결 확인
        </li>
        <li
          className={
            job.status === "반영 완료"
              ? "done"
              : job.records.length
                ? "active"
                : ""
          }
        >
          3. 비교·선택 반영
        </li>
      </ol>
      {job.status === "반영 완료" ? (
        <section className="panel">
          <h2>반영 완료</h2>
          <p className="success" role="status">
            선택한 {job.applied.length}개 항목을 반영했습니다. 선택하지 않은
            값은 유지했습니다.
          </p>
          <Link to="/products">
            제품 확인 <Icon name="arrow" size={16} />
          </Link>
          <p>원본은 업로드 당시 그대로 보관되어 있습니다.</p>
        </section>
      ) : (
        <>
          <section className="panel">
            <h2>현재 기준 시트 선택</h2>
            <p className="muted">
              단가표를 먼저 가져오면 원가계산서의 연결 후보를 찾을 수 있습니다.
              참고 시트와 이전 자료는 원본으로 확인하세요.
            </p>
            <SaveForm
              dirty={sheets.length > 0}
              label={job.records.length ? "다시 분석·비교" : "선택 시트 분석"}
              onSave={async () => {
                const result = await send(`/imports/${id}/analyze`, {
                  ...context,
                  sheets,
                });
                state.setData(result);
                setChoices({});
              }}
            >
              <div className="sheet-list">
                {job.sheets.map((s: any) => (
                  <label className="check" key={s.name}>
                    <input
                      type="checkbox"
                      disabled={s.kind === "reference"}
                      checked={sheets.includes(s.name)}
                      onChange={(e) =>
                        setSheets(
                          e.target.checked
                            ? [...sheets, s.name]
                            : sheets.filter((v) => v !== s.name),
                        )
                      }
                    />
                    <span>
                      {s.name}
                      <small>{kinds[s.kind]}</small>
                    </span>
                  </label>
                ))}
              </div>
              <div className="form-grid">
                <Field
                  name="import-group"
                  label="연결 기술서 (신규는 아래 입력)"
                  value={context.group_id}
                  onChange={groupChange}
                  options={groups.map((g) => ({
                    value: g.id,
                    label: `${g.design} · ${g.product_type}`,
                  }))}
                />
                {["design", "product_type", "prefix", "color"].map((key) => (
                  <Field
                    key={key}
                    name={`import-${key}`}
                    label={key === "color" ? "원가를 연결할 색상" : labels[key]}
                    value={(context as any)[key]}
                    onChange={(v) => setContext({ ...context, [key]: v })}
                  />
                ))}
              </div>
            </SaveForm>
          </section>
          {job.records.length > 0 && (
            <section className="panel">
              <h2>
                변경 후보 <small>{job.records.length}개</small>
              </h2>
              <p className="notice">
                이 화면에서는 현재 값이 바뀌지 않습니다. 행과 필드를 선택하고
                연결 대상·금액·누락된 근거를 확인하세요. 빈 셀은 기본적으로
                선택하지 않습니다.
              </p>
              <div className="inline">
                <button type="button" onClick={() => setManageSizes(true)}>
                  사이즈 설정
                </button>
                <button type="button" onClick={() => setManageDimensions(true)}>
                  상세 규격 설정
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setChoices(
                      Object.fromEntries(
                        job.records.map((r: any) => [
                          r.key,
                          {
                            key: r.key,
                            target_id: r.target_id || null,
                            values: r.values,
                            fields: Object.keys(r.values).filter(
                              (k) => r.values[k] != null && r.values[k] !== "",
                            ),
                          },
                        ]),
                      ),
                    )
                  }
                >
                  모든 행 선택
                </button>
                <button type="button" onClick={() => setChoices({})}>
                  선택 해제
                </button>
              </div>
              <SaveForm
                dirty={Object.keys(choices).length > 0}
                label={`선택한 ${Object.keys(choices).length}개 항목 반영`}
                onSave={async () => {
                  const selected = Object.values(choices).filter(
                    (c: any) => c.fields.length,
                  );
                  if (!selected.length)
                    throw new Error("반영할 변경 항목을 선택하세요.");
                  if (
                    !window.confirm(
                      `${selected.length}개 항목을 반영합니다. 선택한 단가 변경은 관련 제품을 재계산합니다.`,
                    )
                  )
                    return false;
                  const result = await send(`/imports/${id}/apply`, {
                    version: job.version,
                    choices: selected,
                  });
                  state.setData(result);
                  setChoices({});
                }}
              >
                {job.records.map((record: any) => (
                  <ImportRecord
                    key={`${job.version}-${record.key}`}
                    record={record}
                    rates={rates}
                    sizes={sizes.data}
                    sizesError={sizes.error}
                    sizesLoading={sizes.loading}
                    dimensions={dimensions.data}
                    dimensionsError={dimensions.error}
                    dimensionsLoading={dimensions.loading}
                    groupId={job.context.group_id}
                    choice={choices[record.key]}
                    onChange={(choice) =>
                      setChoices((v) => {
                        const next = { ...v };
                        if (choice) next[record.key] = choice;
                        else delete next[record.key];
                        return next;
                      })
                    }
                  />
                ))}
              </SaveForm>
            </section>
          )}
        </>
      )}
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
function ImportRecord({
  record,
  rates,
  sizes,
  sizesError,
  sizesLoading,
  dimensions,
  dimensionsError,
  dimensionsLoading,
  groupId,
  choice,
  onChange,
}: {
  record: any;
  rates: Doc[];
  sizes: SizeOption[];
  sizesError: string;
  sizesLoading: boolean;
  dimensions: SizeOption[];
  dimensionsError: string;
  dimensionsLoading: boolean;
  groupId: string;
  choice: any;
  onChange: (v: any) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [target, setTarget] = useState(record.target_id || "");
  const selected = !!choice;
  const values = choice?.values || record.values;
  const resourcePath =
    target && record.kind === "products"
      ? `/products/${target}`
      : target && record.kind === "costs"
        ? `/products/${target}/cost`
        : groupId && ["spec", "shooting"].includes(record.kind)
          ? `/groups/${groupId}`
          : "/health";
  const existing = useData<Doc | null>(resourcePath, null);
  const old =
    record.kind === "rates"
      ? rates.find((r) => r.id === target)
      : record.kind === "spec"
        ? existing.data?.spec
        : record.kind === "shooting"
          ? existing.data?.shooting?.find((s: Doc) => s.color === values.color)
          : existing.data;

  const update = (patch: any) =>
    onChange({
      key: record.key,
      target_id: target || null,
      values: { ...values },
      fields: Object.keys(values).filter(
        (k) => values[k] != null && values[k] !== "",
      ),
      ...choice,
      ...patch,
    });
  const setTargetId = (id: string) => {
    setTarget(id);
    if (selected) update({ target_id: id || null });
  };
  return (
    <article className={`import-record ${selected ? "selected" : ""}`}>
      <div className="record-header">
        <label className="check">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => (e.target.checked ? update({}) : onChange(null))}
          />
          <span>
            <strong>{record.label}</strong>
            <small>
              {kinds[record.kind]} · {record.source.sheet} · {record.cell}
            </small>
          </span>
        </label>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? "접기" : "연결·변경 확인"}
        </button>
      </div>
      {!!record.warnings.length && (
        <p className="warning">{record.warnings.join(" · ")}</p>
      )}
      {record.target_id && (
        <p className="muted">이전에 확인한 연결을 재사용합니다.</p>
      )}
      {expanded && (
        <div className="record-body">
          {record.kind === "rates" ? (
            <Field
              name={`target-${record.key}`}
              label="기존 단가에 연결 (미선택 시 신규)"
              value={target}
              onChange={setTargetId}
              options={rates.map((r) => ({
                value: r.id,
                label: `${r.name} · ${r.conditions}`,
              }))}
            />
          ) : ["products", "costs"].includes(record.kind) ? (
            <>
              <ProductPicker
                label={
                  record.kind === "costs"
                    ? "원가 적용 제품"
                    : "기존 제품에 연결 (미선택 시 신규)"
                }
                value={target}
                onChange={setTargetId}
              />
              {record.candidates.length > 0 && (
                <p>
                  추천 후보:{" "}
                  {record.candidates.map((p: Doc) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setTargetId(p.id)}
                    >
                      {p.code}
                    </button>
                  ))}
                </p>
              )}
            </>
          ) : null}
          {record.kind === "costs" ? (
            <>
              <div className="notice">
                현재 원가: {money(old?.production_cost)}원 · 현재 상시할인가:{" "}
                {money(old?.sale_price)}원
                {old?.lines && (
                  <p>
                    기존 원가 항목 {old.lines.length}개 → 반영 후보{" "}
                    {values.lines.length}개
                  </p>
                )}
              </div>
              <CostInputs
                prefix={record.key}
                value={values}
                rates={rates}
                setValue={(v) => update({ values: v, fields: Object.keys(v) })}
              />
            </>
          ) : (
            <div className="import-fields">
              {Object.entries(values)
                .filter(([key]) => key !== "items")
                .map(([key, val]) => (
                  <div className="import-field" key={key}>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={choice?.fields.includes(key) || false}
                        onChange={(e) => {
                          const fields = choice?.fields || [];
                          update({
                            fields: e.target.checked
                              ? [...fields, key]
                              : fields.filter((f: string) => f !== key),
                          });
                        }}
                      />
                      <span>{labels[key] || key}</span>
                    </label>
                    <div>
                      <small>
                        현재:{" "}
                        {(record.kind === "rates" || target || groupId) && old
                          ? typeof old[key] === "boolean"
                            ? old[key]
                              ? "포함"
                              : "별도"
                            : String(old[key] ?? "미등록")
                          : "신규 / 연결 후 비교"}
                      </small>
                      {record.kind === "products" &&
                      (key === "size" || key === "dimensions") ? (
                        <>
                          <SizeSelect
                            kind={key === "size" ? "sizes" : "dimensions"}
                            sizes={key === "size" ? sizes : dimensions}
                            value={String(val)}
                            originalSize={target ? old?.[key] : undefined}
                            disabled={
                              key === "size"
                                ? sizesLoading || !!sizesError
                                : dimensionsLoading || !!dimensionsError
                            }
                            required={false}
                            onChange={(v) =>
                              update({
                                values: { ...values, [key]: v },
                                fields: [
                                  ...new Set([
                                    ...(choice?.fields ??
                                      Object.keys(values).filter(
                                        (k) =>
                                          values[k] != null && values[k] !== "",
                                      )),
                                    key,
                                  ]),
                                ],
                              })
                            }
                          />
                          {(key === "size"
                            ? sizesLoading
                            : dimensionsLoading) && (
                            <p role="status">{labels[key]} 불러오는 중…</p>
                          )}
                          <ErrorBox
                            message={
                              key === "size" ? sizesError : dimensionsError
                            }
                          />
                        </>
                      ) : (
                        <Field
                          name={`${record.key}-${key}`}
                          label="반영할 값"
                          value={val}
                          onChange={(v) =>
                            update({
                              values: { ...values, [key]: v },
                              fields: [
                                ...new Set([...(choice?.fields || []), key]),
                              ],
                            })
                          }
                          type={
                            typeof val === "boolean"
                              ? "checkbox"
                              : key === "amount"
                                ? "number"
                                : "text"
                          }
                          multiline={[
                            "notes",
                            "description",
                            "color_details",
                            "keywords",
                          ].includes(key)}
                          options={
                            key === "category"
                              ? categories.map((c) => ({ value: c, label: c }))
                              : undefined
                          }
                        />
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
          {record.kind === "shooting" && (
            <div>
              {values.items.map((item: any) => (
                <p key={item.role}>
                  <strong>{item.role}:</strong> {item.notes}
                </p>
              ))}
              <label className="check">
                <input
                  type="checkbox"
                  checked={choice?.fields.includes("items") || false}
                  onChange={(e) =>
                    update({
                      fields: e.target.checked
                        ? [...new Set([...(choice?.fields || []), "items"])]
                        : (choice?.fields || []).filter(
                            (f: string) => f !== "items",
                          ),
                    })
                  }
                />
                촬영 지시사항 반영
              </label>
            </div>
          )}
          {record.formula && (
            <details>
              <summary>원본 수식 확인</summary>
              <code>{record.formula}</code>
              <p>저장된 계산값: {money(record.values.amount)}원</p>
            </details>
          )}
        </div>
      )}
    </article>
  );
}
