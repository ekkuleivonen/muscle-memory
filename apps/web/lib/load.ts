import { publishedCatalog } from "./catalog-source";
import { library, type Library } from "./library";

let loaded: Promise<Library> | undefined;

/** The browsable library, built once per server instance from published content. */
export function getLibrary(): Promise<Library> {
  loaded ??= publishedCatalog().then(library);
  return loaded;
}
