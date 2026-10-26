import { requireAdmin } from "../../lib/admin-server";
import { publishedCatalog } from "../../lib/catalog-source";
import { adminInventory } from "../../lib/admin-catalog";
export default async function AdminPage() {
  await requireAdmin();
  const items = adminInventory(await publishedCatalog());
  return (
    <>
      <h1>Challenges</h1>
      <p>{items.length} published challenges in this deployment.</p>
      <p>
        Draft and archived lifecycle management is not implemented. Immutable
        revision archives are not an archived challenge status.
      </p>
      <div
        className="admin-inventory"
        role="region"
        aria-label="Published challenge inventory"
        tabIndex={0}
      >
        <table>
          <caption>Published inventory</caption>
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Challenge</th>
              <th scope="col">Language</th>
              <th scope="col">Lifecycle</th>
              <th scope="col">Revision</th>
              <th scope="col">Benchmarks</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.key}>
                <th scope="row">{c.key}</th>
                <td>{c.title}</td>
                <td>{c.language}</td>
                <td>{c.status}</td>
                <td>
                  <code>{c.revision}</code>
                </td>
                <td>Not available</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
