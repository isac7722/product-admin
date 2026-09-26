import { Icon } from "./icons";
import { useState } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import { labels, send, useData, type Doc } from "./api";
import {
  Empty,
  ErrorBox,
  Field,
  Header,
  Loading,
  ProductPicker,
  ProductTable,
  SaveForm,
  Source,
} from "./components";

const specFields = [
  "name_ko",
  "name_en",
  "front_material",
  "back_material",
  "filling",
  "country",
  "keywords",
  "description",
  "color_details",
  "notes",
];
export function GroupPage({ sales = false }: { sales?: boolean }) {
  const { id } = useParams();
  const state = useData<Doc | null>(`/groups/${id}`, null);
  const [editing, setEditing] = useState(false),
    [form, setForm] = useState<any>({});
  if (state.error)
    return <ErrorBox message={state.error} retry={state.reload} />;
  if (!state.data) return <Loading />;
  const group = state.data;
  return (
    <>
      <Link className="back" to={`/catalog/${group.id}?group=${group.id}`}>
        <Icon name="back" size={16} /> {group.design} 컬러·사이즈
      </Link>
      <Header
        title={`${group.design} · ${group.product_type}`}
        description={
          <>
            <span className="badge">공통 자료</span> 이 기술서는 해당 종류의
            모든 색상·사이즈에 공통으로 적용됩니다.
          </>
        }
      />
      <nav className="tabs" aria-label="공통 자료">
        <NavLink to={`/groups/${id}`} end>
          상품기술서·촬영구성
        </NavLink>
        <NavLink to={`/groups/${id}/sales`}>판매구성</NavLink>
        <Link to={`/files?group_id=${id}`}>
          컬러칩·PSD <Icon name="external" size={14} />
        </Link>
      </nav>
      {sales ? (
        <Sales group={group} reload={state.reload} />
      ) : (
        <>
          <section className="panel">
            <div className="section-heading">
              <h2>기본·기술 정보</h2>
              {!editing && (
                <button
                  onClick={() => {
                    setForm(group.spec);
                    setEditing(true);
                  }}
                >
                  기술서 편집
                </button>
              )}
            </div>
            {editing ? (
              <SaveForm
                onSave={async () => {
                  await send(
                    `/groups/${id}/spec`,
                    { ...form, version: group.version },
                    "PUT",
                  );
                  setEditing(false);
                  state.reload();
                }}
                cancel={() => setEditing(false)}
              >
                <div className="form-grid">
                  {specFields.map((key) => (
                    <Field
                      key={key}
                      name={key}
                      value={form[key]}
                      onChange={(v) => setForm({ ...form, [key]: v })}
                      multiline={[
                        "description",
                        "notes",
                        "keywords",
                        "color_details",
                      ].includes(key)}
                    />
                  ))}
                </div>
              </SaveForm>
            ) : (
              <>
                <dl className="detail-grid">
                  {specFields.map((key) => (
                    <div
                      key={key}
                      className={
                        ["description", "notes", "color_details"].includes(key)
                          ? "wide"
                          : ""
                      }
                    >
                      <dt>{labels[key]}</dt>
                      <dd>{group.spec[key] || "미등록"}</dd>
                    </div>
                  ))}
                </dl>
                <Source source={group.spec.source} />
              </>
            )}
          </section>
          <section className="panel">
            <h2>
              대상 색상·사이즈 <small>{group.products.length}개 제품</small>
            </h2>
            <ProductTable products={group.products} />
          </section>
          <Shooting group={group} reload={state.reload} />
          <section className="panel">
            <div className="section-heading">
              <h2>전체 색상 모음</h2>
              <Link to={`/files?group_id=${id}`}>
                자료 관리 <Icon name="arrow" size={16} />
              </Link>
            </div>
            {group.files
              .filter((f: Doc) => f.purpose === "overview")
              .map((f: Doc) => (
                <a key={f.id} href={`/api/files/${f.id}/download`}>
                  <img
                    className="overview"
                    src={`/api/files/${f.id}/preview`}
                    alt={`${group.design} ${group.product_type} 전체 색상 모음 JPG`}
                  />
                  <p>JPG 원본 다운로드</p>
                </a>
              ))}
            {!group.files.some((f: Doc) => f.purpose === "overview") && (
              <Empty>전체 색상 모음 JPG가 등록되지 않았습니다.</Empty>
            )}
          </section>
        </>
      )}
    </>
  );
}
function Shooting({ group, reload }: { group: Doc; reload: () => void }) {
  const colors = Array.from(
    new Set<string>(group.products.map((p: Doc) => p.color)),
  );
  const [color, setColor] = useState(colors[0] || ""),
    [editing, setEditing] = useState(false),
    [form, setForm] = useState<any>({});
  const current = group.shooting.find((s: Doc) => s.color === color);
  const start = () => {
    setForm(
      current
        ? { ...current }
        : {
            color,
            front_color: "",
            back_color: "",
            items: ["기본 베개커버", "코디 베개커버", "침대패드"].map(
              (role) => ({ role, product_id: null, notes: "" }),
            ),
            notes: "",
          },
    );
    setEditing(true);
  };
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>색상별 촬영구성</h2>
        <div className="inline">
          <label>
            색상{" "}
            <select
              aria-label="촬영 색상"
              value={color}
              onChange={(e) => {
                if (
                  !editing ||
                  window.confirm("변경사항을 버리고 색상을 전환할까요?")
                ) {
                  setColor(e.target.value);
                  setEditing(false);
                }
              }}
            >
              {colors.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          {!editing && (
            <button disabled={!color} onClick={start}>
              촬영구성 편집
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <SaveForm
          onSave={async () => {
            const data = {
              color,
              front_color: form.front_color,
              back_color: form.back_color,
              items: form.items,
              notes: form.notes,
              version: current?.version,
            };
            await send(`/groups/${group.id}/shooting`, data, "PUT");
            setEditing(false);
            reload();
          }}
          cancel={() => setEditing(false)}
        >
          <div className="form-grid">
            {["front_color", "back_color"].map((key) => (
              <Field
                key={key}
                name={`shoot-${key}`}
                label={labels[key]}
                value={form[key]}
                onChange={(v) => setForm({ ...form, [key]: v })}
              />
            ))}
          </div>
          {form.items.map((item: any, i: number) => (
            <div className="subsection" key={item.role}>
              <h3>{item.role}</h3>
              <ProductPicker
                label={item.role}
                value={item.product_id || ""}
                onChange={(id) =>
                  setForm({
                    ...form,
                    items: form.items.map((v: any, j: number) =>
                      j === i ? { ...v, product_id: id || null } : v,
                    ),
                  })
                }
              />
              <Field
                name={`shoot-notes-${i}`}
                label="미등록 제품명·촬영 지시"
                value={item.notes}
                onChange={(notes) =>
                  setForm({
                    ...form,
                    items: form.items.map((v: any, j: number) =>
                      j === i ? { ...v, notes } : v,
                    ),
                  })
                }
              />
            </div>
          ))}
          <Field
            name="shoot-notes"
            label="촬영 비고·추가 참고 항목"
            multiline
            value={form.notes}
            onChange={(notes) => setForm({ ...form, notes })}
          />
        </SaveForm>
      ) : !current ? (
        <Empty>이 색상의 촬영구성이 없습니다.</Empty>
      ) : (
        <>
          <p>
            앞 색상: {current.front_color || "미등록"} / 뒤 색상:{" "}
            {current.back_color || "미등록"}
          </p>
          <dl className="detail-grid">
            {current.items.map((i: any) => (
              <div key={i.role}>
                <dt>{i.role}</dt>
                <dd>
                  {i.product_id && (
                    <Link to={`/products/${i.product_id}`}>
                      연결 제품 보기 <Icon name="external" size={14} />
                    </Link>
                  )}
                  <p>{i.notes || "미등록"}</p>
                </dd>
              </div>
            ))}
            <div className="wide">
              <dt>촬영 비고</dt>
              <dd>{current.notes || "없음"}</dd>
            </div>
          </dl>
          <Source source={current.source} />
        </>
      )}
    </section>
  );
}
function Sales({ group, reload }: { group: Doc; reload: () => void }) {
  const [channel, setChannel] = useState("자사몰"),
    [form, setForm] = useState<any>(null),
    [original, setOriginal] = useState<Doc | null>(null);
  const list = group.sales.filter((s: Doc) => s.channel === channel);
  const start = (sale?: Doc) => {
    setOriginal(sale || null);
    setForm(
      sale
        ? {
            name: sale.name,
            sale_type: sale.sale_type,
            items: sale.items,
            parent_id: sale.parent_id,
            notes: sale.notes,
          }
        : {
            name: "",
            sale_type: "단품",
            items: [{ product_id: "", quantity: 1, display_name: "" }],
            parent_id: "",
            notes: "",
          },
    );
  };
  return (
    <div className="sales-layout">
      <section className="panel">
        <div className="section-heading">
          <h2>판매처별 판매구성</h2>
          <button className="primary" onClick={() => start()}>
            <Icon name="plus" size={18} /> 판매구성 등록
          </button>
        </div>
        <div className="segmented">
          {["자사몰", "입점몰", "도매몰"].map((c) => (
            <button
              aria-pressed={channel === c}
              key={c}
              onClick={() => {
                if (
                  !form ||
                  window.confirm("변경사항을 버리고 판매처를 전환할까요?")
                ) {
                  setChannel(c);
                  setForm(null);
                }
              }}
            >
              {c}
            </button>
          ))}
        </div>
        {form && (
          <SaveForm
            onSave={async () => {
              await send(
                original ? `/sales/${original.id}` : "/sales",
                {
                  ...form,
                  group_id: group.id,
                  channel,
                  parent_id:
                    form.sale_type === "추가옵션"
                      ? form.parent_id || null
                      : null,
                  version: original?.version,
                },
                original ? "PUT" : "POST",
              );
              setForm(null);
              reload();
            }}
            cancel={() => setForm(null)}
          >
            <div className="form-grid">
              <Field
                name="sale-name"
                label="판매용 제품명"
                value={form.name}
                required
                onChange={(name) => setForm({ ...form, name })}
              />
              <Field
                name="sale-type"
                label="구성 유형"
                value={form.sale_type}
                onChange={(sale_type) => setForm({ ...form, sale_type })}
                options={["단품", "세트", "추가옵션"].map((v) => ({
                  value: v,
                  label: v,
                }))}
              />
              {form.sale_type === "추가옵션" && (
                <Field
                  name="sale-parent"
                  label="적용할 판매구성"
                  required
                  value={form.parent_id}
                  onChange={(parent_id) => setForm({ ...form, parent_id })}
                  options={list
                    .filter(
                      (s: Doc) =>
                        s.sale_type !== "추가옵션" && s.id !== original?.id,
                    )
                    .map((s: Doc) => ({ value: s.id, label: s.name }))}
                />
              )}
            </div>
            <h3>구성 제품</h3>
            {form.items.map((item: any, i: number) => (
              <div className="subsection" key={i}>
                <ProductPicker
                  value={item.product_id}
                  onChange={(product_id) =>
                    setForm({
                      ...form,
                      items: form.items.map((v: any, j: number) =>
                        i === j ? { ...v, product_id } : v,
                      ),
                    })
                  }
                />
                <div className="form-grid">
                  <Field
                    name={`quantity-${i}`}
                    label="수량"
                    type="number"
                    required
                    value={item.quantity}
                    onChange={(quantity) =>
                      setForm({
                        ...form,
                        items: form.items.map((v: any, j: number) =>
                          i === j ? { ...v, quantity: Number(quantity) } : v,
                        ),
                      })
                    }
                  />
                  <Field
                    name={`display-${i}`}
                    label="판매 표시명 (예: 킹 K)"
                    value={item.display_name}
                    onChange={(display_name) =>
                      setForm({
                        ...form,
                        items: form.items.map((v: any, j: number) =>
                          i === j ? { ...v, display_name } : v,
                        ),
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      items: form.items.filter((_: any, j: number) => i !== j),
                    })
                  }
                >
                  이 구성품 제거
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setForm({
                  ...form,
                  items: [
                    ...form.items,
                    { product_id: "", quantity: 1, display_name: "" },
                  ],
                })
              }
            >
              <Icon name="plus" size={18} /> 구성품 추가
            </button>
            <Field
              name="sale-notes"
              label="판매 비고"
              multiline
              value={form.notes}
              onChange={(notes) => setForm({ ...form, notes })}
            />
          </SaveForm>
        )}
        {!list.length && !form ? (
          <Empty>이 판매처에 등록된 판매구성이 없습니다.</Empty>
        ) : (
          list.map((sale: Doc) => (
            <article className="sale-card" key={sale.id}>
              <div className="section-heading">
                <div>
                  <span className="badge">{sale.sale_type}</span>
                  <h3>{sale.name}</h3>
                </div>
                <button onClick={() => start(sale)}>편집</button>
              </div>
              {sale.items.map((item: any, i: number) => (
                <p key={i}>
                  <Link to={`/products/${item.product_id}`}>
                    {item.display_name || "연결 제품"}
                  </Link>{" "}
                  × {item.quantity}개
                </p>
              ))}
              {sale.parent_id && (
                <p className="muted">
                  적용 구성:{" "}
                  {group.sales.find((s: Doc) => s.id === sale.parent_id)?.name}
                </p>
              )}
              <p>{sale.notes}</p>
            </article>
          ))
        )}
      </section>
      <aside className="panel reference">
        <h2>촬영구성 참고</h2>
        <p className="muted">촬영구성을 참고해 판매구성을 직접 작성하세요.</p>
        {group.shooting.length ? (
          group.shooting.map((s: Doc) => (
            <div className="subsection" key={s.id}>
              <h3>{s.color}</h3>
              {s.items.map((i: any) => (
                <p key={i.role}>
                  <strong>{i.role}</strong>
                  <br />
                  {i.notes || "미등록"}
                  {i.product_id && (
                    <>
                      {" "}
                      <Link to={`/products/${i.product_id}`}>제품 보기</Link>
                    </>
                  )}
                </p>
              ))}
              <p>{s.notes}</p>
            </div>
          ))
        ) : (
          <p>등록된 촬영구성이 없습니다.</p>
        )}
      </aside>
    </div>
  );
}
