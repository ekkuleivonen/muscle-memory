/**
 * What R2 SQL (Basin SQL) documents, for highlighting and completion: keywords from its SQL
 * reference and functions from its scalar and aggregate function pages, as checked on
 * 27 October 2026 (developers.cloudflare.com/r2-sql/sql-reference/). Nothing from another
 * engine is suggested; a function missing here may still exist, it is just not offered.
 */
export const KEYWORDS = (
  "select from where and or not as on using join inner left right full outer cross group by " +
  "order having limit offset union all intersect except distinct case when then else end in " +
  "is null like ilike similar to between with asc desc nulls first last over partition rows " +
  "range unbounded preceding following current row qualify exists true false cast try_cast " +
  "interval grouping sets rollup cube filter values show tables databases namespaces describe " +
  "explain format json extract year month day hour minute second unknown"
).split(" ");

export const TYPES = (
  "boolean tinyint smallint int integer bigint float double real decimal varchar string text " +
  "date timestamp"
).split(" ");

export type FunctionKind = "aggregate" | "window" | "scalar";

const groups: [string, FunctionKind, string][] = [
  ["core", "scalar", "arrow_cast arrow_typeof coalesce get_field greatest least named_struct nullif nvl nvl2 overlay struct"],
  ["crypto", "scalar", "digest md5 sha224 sha256 sha384 sha512"],
  [
    "date and time",
    "scalar",
    "current_date current_time date_bin date_part date_trunc from_unixtime make_date make_time now to_char to_date to_local_time to_time to_timestamp to_timestamp_micros to_timestamp_millis to_timestamp_nanos to_timestamp_seconds to_unixtime",
  ],
  ["encoding", "scalar", "decode encode"],
  ["JSON", "scalar", "json_as_text json_contains json_get json_get_array json_get_bool json_get_float json_get_int json_get_json json_get_str json_length"],
  [
    "math",
    "scalar",
    "abs cbrt ceil degrees exp factorial floor gcd lcm ln log log2 log10 isnan iszero nanvl pi power radians random round signum sqrt trunc sinh cosh tanh asinh acosh atanh sin cos tan asin acos atan atan2 cot",
  ],
  ["regex", "scalar", "regexp_count regexp_instr regexp_like regexp_match regexp_replace"],
  [
    "string",
    "scalar",
    "ascii bit_length btrim chr concat concat_ws contains ends_with levenshtein lower ltrim octet_length repeat replace rtrim split_part starts_with to_hex upper uuid character_length find_in_set initcap left lpad reverse right rpad strpos substr substr_index translate",
  ],
  ["map", "scalar", "map_keys"],
  [
    "aggregate",
    "aggregate",
    "count sum avg mean min max median percentile_cont approx_percentile_cont approx_percentile_cont_with_weight approx_median approx_distinct approx_top_k var var_samp var_pop stddev stddev_samp stddev_pop covar_samp covar covar_pop corr regr_slope regr_intercept regr_count regr_r2 regr_avgx regr_avgy regr_sxx regr_syy regr_sxy bit_and bit_or bit_xor bool_and bool_or array_agg string_agg",
  ],
  ["window", "window", "row_number rank dense_rank percent_rank cume_dist ntile lag lead first_value last_value nth_value"],
];

export interface SqlFunction {
  name: string;
  kind: FunctionKind;
  group: string;
}

export const FUNCTIONS: SqlFunction[] = groups.flatMap(([group, kind, names]) =>
  names.split(" ").map((name) => ({ name, kind, group })),
);
