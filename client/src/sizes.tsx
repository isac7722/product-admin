import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { send, useData, type Doc } from "./api";
import {
  Empty,
  ErrorBox,
  Field,
  Header,
  Loading,
  SaveForm,
} from "./components";

type SettingKind = "sizes" | "dimensions";
const settingTitle = (kind: SettingKind) =>
  kind === "sizes" ? "사이즈" : "상세 규격";

export type SizeOption = Doc & {
  name: string;
  description: string;
  sort_order: number;
  active: boolean;
  usage_count: number;
};
type SizeForm = {
  name: string;
  description: string;
  sort_order: number;
  active: boolean;
};
type Preview = {
  products: { id: string; code?: string; before: string; after: string }[];
  product_versions: Record<string, number>;
};
const emptySize: SizeForm = {
  name: "",
  description: "",
  sort_order: 0,
  active: true,
};

export function SizeSelect({
  kind = "sizes",
  sizes,
  value,
  onChange,
  originalSize,
  disabled = false,
  required = true,
}: {
  kind?: SettingKind;
  sizes: SizeOption[];
  value: string;
  onChange: (value: string) => void;
  originalSize?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const noun = settingTitle(kind);
  const id = useId();
  const available = sizes.filter((s) => s.active || s.name === originalSize);
  const current = sizes.find((s) => s.name === value);
  const invalid = !!value && !available.some((s) => s.name === value);
  return (
    <div className="field">
      <label htmlFor={id}>
        {kind === "dimensions" ? "상세 규격(cm)" : noun}{" "}
        {required && <span className="required">*</span>}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-help`}
      >
        <option value="">
          {kind === "sizes" ? "사이즈를 선택하세요" : "선택 안 함"}
        </option>
        {invalid && (
          <option value={value} disabled>
            {value} · {current ? "사용 중지" : "미등록"}
          </option>
        )}
        {available.map((s) => (
          <option key={s.id} value={s.name}>
            {s.name}
            {!s.active ? " · 사용 중지" : ""}
            {s.description ? ` (${s.description})` : ""}
          </option>
        ))}
      </select>
      <small id={`${id}-help`} className={invalid ? "error-text" : "muted"}>
        {invalid
          ? `${noun} 설정에서 항목을 추가·사용 재개하거나 등록된 항목을 선택하세요.`
          : !available.length
            ? `${noun} 설정에서 선택할 항목을 추가해 주세요.`
            : current && !current.active
              ? `사용 중지된 ${noun}입니다. 이 제품의 기존 값은 유지할 수 있습니다.`
              : kind === "sizes"
                ? "사이즈는 설정에서 관리합니다. 실제 치수는 상세 규격에서 선택하세요."
                : "상세 규격은 설정에서 관리합니다. 선택하지 않아도 저장할 수 있습니다."}
      </small>
    </div>
  );
}

export function SizeSettings({
  kind = "sizes",
  onChanged,
  onDirtyChange,
}: {
  kind?: SettingKind;
  onChanged?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const noun = settingTitle(kind);
  const changeTarget = kind === "sizes" ? "코드" : "상세 규격";
  const state = useData<SizeOption[]>(`/${kind}`, []);
  const [editing, setEditing] = useState<SizeOption | null>(null);
  const [value, setValue] = useState<SizeForm>(emptySize);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const baseline = editing || emptySize;
  const dirty = (Object.keys(emptySize) as (keyof SizeForm)[]).some(
    (k) => value[k] !== baseline[k],
  );
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  const reset = () => {
    setEditing(null);
    setValue(emptySize);
    setPreview(null);
    setFormKey((k) => k + 1);
  };
  const change = (key: keyof SizeForm, next: string | number | boolean) => {
    setValue((v) => ({ ...v, [key]: next }));
    setPreview(null);
    setNotice("");
  };
  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <h2>등록된 {noun}</h2>
          <button
            type="button"
            onClick={() => {
              if (
                dirty &&
                !window.confirm(
                  `작성 중인 설정을 버리고 새 ${noun} 항목을 추가할까요?`,
                )
              )
                return;
              reset();
              heading.current?.focus();
            }}
          >
            {noun} 추가
          </button>
        </div>
        <p className="muted">
          표시 순서가 작은 항목부터 나옵니다. 사용 중지해도 기존 제품은
          유지됩니다.
        </p>
        <ErrorBox message={state.error} retry={state.reload} />
        {state.loading ? (
          <Loading />
        ) : !state.data.length ? (
          <Empty>등록된 {noun} 항목이 없습니다. 아래에서 추가하세요.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="size-settings-table">
              <thead>
                <tr>
                  <th>이름·설명</th>
                  <th>표시 순서</th>
                  <th>상태</th>
                  <th>사용 제품</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((size) => (
                  <tr key={size.id}>
                    <td data-label="이름·설명">
                      <strong>{size.name}</strong>
                      <small>{size.description || "설명 없음"}</small>
                    </td>
                    <td data-label="표시 순서">{size.sort_order}</td>
                    <td data-label="상태">
                      <span className="badge">
                        {size.active ? "사용 중" : "사용 중지"}
                      </span>
                    </td>
                    <td data-label="사용 제품">
                      {kind === "dimensions" ? (
                        `${size.usage_count}개`
                      ) : size.usage_count ? (
                        <Link
                          to={`/products?size=${encodeURIComponent(size.name)}`}
                        >
                          {size.usage_count}개
                        </Link>
                      ) : (
                        "0개"
                      )}
                    </td>
                    <td data-label="관리">
                      <button
                        type="button"
                        aria-label={`${size.name} 수정`}
                        onClick={() => {
                          if (
                            dirty &&
                            !window.confirm(
                              `작성 중인 설정을 버리고 다른 ${noun} 항목을 수정할까요?`,
                            )
                          )
                            return;
                          setEditing(size);
                          setValue({
                            name: size.name,
                            description: size.description,
                            sort_order: size.sort_order,
                            active: size.active,
                          });
                          setPreview(null);
                          setFormKey((k) => k + 1);
                          setNotice("");
                          heading.current?.focus();
                        }}
                      >
                        수정
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel form-panel">
        <h2 ref={heading} tabIndex={-1}>
          {editing ? `${editing.name} ${noun} 수정` : `새 ${noun} 추가`}
        </h2>
        {notice && (
          <p className="success" role="status">
            {notice}
          </p>
        )}
        <SaveForm
          key={formKey}
          dirty={dirty}
          cancel={editing ? reset : undefined}
          label={
            preview
              ? `${preview.products.length}개 제품 ${changeTarget} 변경 및 저장`
              : editing
                ? "변경 내용 저장"
                : `${noun} 추가 저장`
          }
          onSave={async () => {
            const payload = { ...value, version: editing?.version };
            if (editing && value.name.trim() !== editing.name && !preview) {
              const result = (await send(
                `/${kind}/${editing.id}/preview`,
                payload,
              )) as Preview;
              if (result.products.length) {
                setPreview(result);
                return false;
              }
            }
            try {
              await send(
                editing ? `/${kind}/${editing.id}` : `/${kind}`,
                { ...payload, product_versions: preview?.product_versions },
                editing ? "PUT" : "POST",
              );
            } catch (error) {
              setPreview(null);
              throw error;
            }
            reset();
            setNotice(
              editing
                ? `${noun} 설정을 변경했습니다.`
                : `${noun} 항목을 추가했습니다. 제품 화면에서 선택할 수 있습니다.`,
            );
            state.reload();
            onChanged?.();
          }}
        >
          <div className="form-grid">
            <Field
              name={`${kind}-setting-name`}
              label={kind === "sizes" ? "사이즈 이름" : "상세 규격(cm)"}
              value={value.name}
              required
              onChange={(v) => change("name", v)}
            />
            <Field
              name={`${kind}-setting-description`}
              label="설명 (선택)"
              value={value.description}
              onChange={(v) => change("description", v)}
            />
            <div className="field">
              <label htmlFor={`${kind}-setting-order`}>표시 순서</label>
              <input
                id={`${kind}-setting-order`}
                type="number"
                min="0"
                max="9999"
                step="1"
                required
                value={value.sort_order}
                onChange={(e) => change("sort_order", Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor={`${kind}-setting-active`}>사용 여부</label>
              <select
                id={`${kind}-setting-active`}
                value={value.active ? "active" : "inactive"}
                onChange={(e) => change("active", e.target.value === "active")}
              >
                <option value="active">사용 중</option>
                <option value="inactive">사용 중지</option>
              </select>
            </div>
          </div>
          <p className="muted">
            {kind === "sizes"
              ? "예: SS, Q, K, Q/K. 하이픈(-)은 사용할 수 없습니다."
              : "예: 150 × 200, 50 × 70. 단위는 cm이며 사이즈와 별도로 관리합니다."}{" "}
            같은 이름은 중복 등록할 수 없습니다.
          </p>
          {preview && (
            <div className="notice" role="status">
              <strong>
                연결된 {preview.products.length}개 제품의 {changeTarget} 값이
                변경됩니다.
              </strong>
              <p>
                제품의 원가·자료 연결은 유지됩니다. 아래 변경을 확인한 후
                저장하세요.
              </p>
              <ul className="size-code-preview">
                {preview.products.map((p) => (
                  <li key={p.id}>
                    {p.code && <span>{p.code}: </span>}
                    {p.before} → {p.after}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setPreview(null)}>
                계속 수정
              </button>
            </div>
          )}
        </SaveForm>
      </section>
    </>
  );
}

export function SizeSettingsPage({ kind = "sizes" }: { kind?: SettingKind }) {
  return (
    <>
      <Header
        title="설정"
        description="제품 입력에 사용할 기본값을 관리합니다."
      />
      <nav className="tabs" aria-label="설정 메뉴">
        <Link
          className={kind === "sizes" ? "active" : undefined}
          to="/settings/sizes"
          aria-current={kind === "sizes" ? "page" : undefined}
        >
          사이즈 관리
        </Link>
        <Link
          className={kind === "dimensions" ? "active" : undefined}
          to="/settings/dimensions"
          aria-current={kind === "dimensions" ? "page" : undefined}
        >
          상세 규격 관리
        </Link>
      </nav>
      <SizeSettings key={kind} kind={kind} />
    </>
  );
}

export function SizeSettingsDialog({
  kind = "sizes",
  onClose,
  onChanged,
}: {
  kind?: SettingKind;
  onClose: () => void;
  onChanged: () => void;
}) {
  const noun = settingTitle(kind);
  const ref = useRef<HTMLDialogElement>(null);
  const [dirty, setDirty] = useState(false);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const close = () => {
    if (
      !dirty ||
      window.confirm(
        `${noun} 설정을 닫을까요? 저장하지 않은 설정은 사라지고 제품 입력은 유지됩니다.`,
      )
    )
      onClose();
  };
  return createPortal(
    <dialog
      ref={ref}
      className="size-settings-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="section-heading size-dialog-header">
        <h2 id={titleId}>{noun} 설정</h2>
        <button type="button" onClick={close}>
          닫기
        </button>
      </div>
      <p className="muted">
        설정을 저장한 뒤 닫으면 작성 중인 화면에서 {noun} 항목을 선택할 수
        있습니다.
      </p>
      <SizeSettings
        kind={kind}
        onChanged={onChanged}
        onDirtyChange={setDirty}
      />
    </dialog>,
    document.body,
  );
}
