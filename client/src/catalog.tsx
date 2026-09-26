import { Icon } from "./icons";
import {
  Link,
  Outlet,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useData, type Doc } from "./api";
import { Empty, ErrorBox, Header, Loading } from "./components";
import { CostPage, ProductInfo } from "./products";

type Catalog = { id: string; design: string; groups: Doc[] };

export function CatalogLayout() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const state = useData<Catalog | null>(`/catalog/${id}`, null);
  if (state.error)
    return <ErrorBox message={state.error} retry={state.reload} />;
  if (!state.data || state.data.id !== id) return <Loading />;
  const catalog = state.data;
  const requestedGroup = params.get("group") || id;
  const group = catalog.groups.find((g) => g.id === requestedGroup);
  if (!group)
    return (
      <section className="panel">
        <h1>제품 종류를 찾을 수 없습니다</h1>
        <Link to={`/catalog/${id}`}>전체 컬러·사이즈로 돌아가기</Link>
      </section>
    );
  const products: Doc[] = group.products;
  const product = products.find((p) => p.id === params.get("product")) || null;
  const colors = [...new Set<string>(products.map((p) => p.color))];
  const sizes = [...new Set<string>(products.map((p) => p.size))];
  const variants = new Map(
    products.map((p) => [JSON.stringify([p.color, p.size]), p]),
  );
  const images = new Map<string, Doc>(
    group.files
      .filter((f: Doc) => f.purpose === "color")
      .map((f: Doc) => [f.color, f]),
  );
  const newParams = new URLSearchParams({
    design: catalog.design,
    product_type: group.product_type,
    prefix: group.prefix,
    group_id: group.id,
  });
  return (
    <>
      <Link
        className="back"
        to={sessionStorage.getItem("product-list-url") || "/products"}
      >
        <Icon name="back" size={16} /> 제품 목록
      </Link>
      <Header
        title={catalog.design}
        description={`${catalog.groups.length}개 종류 · 종류별 컬러와 사이즈를 한눈에 확인하세요.`}
        action={
          <Link className="button primary" to={`/products/new?${newParams}`}>
            <Icon name="plus" size={18} /> 컬러·사이즈 추가
          </Link>
        }
      />
      <section
        className="panel catalog-overview"
        aria-labelledby="variant-heading"
      >
        <div className="section-heading">
          <div>
            <h2 id="variant-heading">컬러·사이즈</h2>
            <p className="muted">
              등록된 조합을 선택하면 아래에 제품정보와 원가가 표시됩니다.
            </p>
          </div>
          <span className="badge">{products.length}개 조합</span>
        </div>
        {catalog.groups.length > 1 ? (
          <nav className="type-picker" aria-label="제품 종류 선택">
            {catalog.groups.map((g) => (
              <Link
                key={g.id}
                className="button"
                preventScrollReset
                to={`/catalog/${id}?group=${g.id}`}
                aria-current={g.id === group.id ? "true" : undefined}
              >
                {g.product_type}
                {g.id === group.id && <span className="sr-only"> 선택됨</span>}
              </Link>
            ))}
          </nav>
        ) : (
          <p className="catalog-type">{group.product_type}</p>
        )}
        <p className="muted">
          컬러 {colors.length}개 · 사이즈 {sizes.join(" / ") || "미등록"}
        </p>
        {!products.length ? (
          <Empty>등록된 컬러·사이즈가 없습니다.</Empty>
        ) : (
          <div
            className="table-wrap variant-table-wrap"
            tabIndex={0}
            role="region"
            aria-label="전체 컬러와 사이즈 조합"
          >
            <table className="variant-matrix">
              <caption className="sr-only">
                {catalog.design} {group.product_type} 컬러별 사이즈. 미등록은
                제품 조합이 없음을 뜻합니다.
              </caption>
              <thead>
                <tr>
                  <th scope="col">컬러</th>
                  {sizes.map((size) => (
                    <th scope="col" key={size}>
                      {size}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {colors.map((color) => {
                  const image = images.get(color);
                  return (
                    <tr key={color}>
                      <th scope="row">
                        <div className="variant-color">
                          {image ? (
                            <a
                              href={`/api/files/${image.id}/download`}
                              aria-label={`${color} 컬러칩 원본 다운로드`}
                            >
                              <img
                                width="48"
                                height="48"
                                loading="lazy"
                                src={`/api/files/${image.id}/preview`}
                                alt={`${color} 컬러칩`}
                              />
                            </a>
                          ) : (
                            <span
                              className="color-placeholder"
                              aria-hidden="true"
                            >
                              <Icon name="image" />
                            </span>
                          )}
                          <span>
                            {color}
                            {!image && <small>이미지 미등록</small>}
                          </span>
                        </div>
                      </th>
                      {sizes.map((size) => {
                        const variant = variants.get(
                          JSON.stringify([color, size]),
                        );
                        const selected =
                          variant?.id === product?.id && !!variant;
                        return (
                          <td key={size}>
                            <span className="mobile-size">{size}</span>
                            {variant ? (
                              <Link
                                className={`button variant-choice${selected ? " selected" : ""}`}
                                aria-current={selected ? "true" : undefined}
                                aria-label={`${color} ${size} 선택`}
                                preventScrollReset
                                to={`/catalog/${id}?group=${group.id}&product=${variant.id}`}
                              >
                                {selected ? "선택됨" : "상세 보기"}
                              </Link>
                            ) : (
                              <span className="variant-missing">미등록</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <nav className="catalog-resources" aria-label="선택한 종류의 공통 자료">
          <span>{group.product_type} 공통 자료</span>
          <Link to={`/groups/${group.id}`}>
            상품기술서 <Icon name="external" size={14} />
          </Link>
          <Link to={`/groups/${group.id}/sales`}>
            판매구성 <Icon name="external" size={14} />
          </Link>
          <Link to={`/files?group_id=${group.id}`}>
            컬러칩·PSD <Icon name="external" size={14} />
          </Link>
        </nav>
      </section>
      {params.get("product") && !product && (
        <p className="warning" role="alert">
          이 종류에 속한 제품을 찾을 수 없습니다. 위에서 컬러·사이즈를 다시
          선택하세요.
        </p>
      )}
      <p className="selection-summary" role="status">
        {product
          ? `선택한 조합: ${group.product_type} / ${product.color} / ${product.size}`
          : "컬러·사이즈를 선택하세요."}
      </p>
      <Outlet
        key={product?.id || group.id}
        context={{ product, reload: state.reload }}
      />
    </>
  );
}

export function VariantDetails() {
  const { product } = useOutletContext<{ product: Doc | null }>();
  if (!product)
    return (
      <section className="panel">
        <Empty>위 표에서 확인할 컬러·사이즈의 ‘상세 보기’를 선택하세요.</Empty>
      </section>
    );
  return (
    <>
      <ProductInfo />
      <div id="variant-cost">
        <CostPage />
      </div>
    </>
  );
}
