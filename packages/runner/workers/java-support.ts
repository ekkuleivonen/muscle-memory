/**
 * The Java side of the Java runner. TeaVM compiles ahead of time and keeps almost no
 * reflection, so, as with C and C++, each Java Challenge carries an adapter that turns a case's
 * JSON arguments into the method's types. `Json` is the small library it uses; `MmMain` runs the
 * adapter for one case (the arguments are its only command-line argument) and prints the result
 * on a marked line, so System.out stays the program's own.
 */
export const JSON_JAVA = String.raw`import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** A JSON value: a case's arguments, or what an adapter returns. */
public final class Json {
    private final Object value;

    private Json(Object value) {
        this.value = value;
    }

    // Reading arguments.
    public Json at(int index) {
        return new Json(((List<?>) value).get(index));
    }

    public Json get(String key) {
        return new Json(((Map<?, ?>) value).get(key));
    }

    public int size() {
        return value instanceof List ? ((List<?>) value).size() : ((Map<?, ?>) value).size();
    }

    public boolean isNull() {
        return value == null;
    }

    public int asInt() {
        return ((Number) value).intValue();
    }

    public long asLong() {
        return ((Number) value).longValue();
    }

    public double asDouble() {
        return ((Number) value).doubleValue();
    }

    public boolean asBoolean() {
        return (Boolean) value;
    }

    public String asString() {
        return (String) value;
    }

    public List<Json> asList() {
        List<Json> items = new ArrayList<>();
        for (Object item : (List<?>) value) items.add(new Json(item));
        return items;
    }

    public int[] asIntArray() {
        List<?> list = (List<?>) value;
        int[] out = new int[list.size()];
        for (int i = 0; i < out.length; i++) out[i] = ((Number) list.get(i)).intValue();
        return out;
    }

    public String[] asStringArray() {
        List<?> list = (List<?>) value;
        String[] out = new String[list.size()];
        for (int i = 0; i < out.length; i++) out[i] = (String) list.get(i);
        return out;
    }

    /** Wraps a result: numbers, booleans, strings, null, arrays, lists, maps or Json. */
    public static Json of(Object value) {
        return value instanceof Json ? (Json) value : new Json(value);
    }

    public static Json parse(String text) {
        Parser parser = new Parser(text);
        return new Json(parser.value());
    }

    public String write() {
        StringBuilder out = new StringBuilder();
        write(out, value);
        return out.toString();
    }

    private static void write(StringBuilder out, Object value) {
        if (value instanceof Json) {
            write(out, ((Json) value).value);
        } else if (value == null) {
            out.append("null");
        } else if (value instanceof String || value instanceof Character) {
            writeString(out, value.toString());
        } else if (value instanceof Boolean) {
            out.append(value);
        } else if (value instanceof Double || value instanceof Float) {
            double d = ((Number) value).doubleValue();
            if (d == Math.rint(d) && Math.abs(d) < 9007199254740992.0) out.append((long) d);
            else out.append(d);
        } else if (value instanceof Number) {
            out.append(((Number) value).longValue());
        } else if (value instanceof Map) {
            out.append('{');
            boolean first = true;
            // Keys, not Map.Entry: TeaVM's class library for javac has no Map.Entry.
            Map<?, ?> map = (Map<?, ?>) value;
            for (Object key : map.keySet()) {
                if (!first) out.append(',');
                first = false;
                writeString(out, String.valueOf(key));
                out.append(':');
                write(out, map.get(key));
            }
            out.append('}');
        } else if (value instanceof Iterable) {
            out.append('[');
            boolean first = true;
            for (Object item : (Iterable<?>) value) {
                if (!first) out.append(',');
                first = false;
                write(out, item);
            }
            out.append(']');
        } else if (value instanceof int[]) {
            int[] array = (int[]) value;
            out.append('[');
            for (int i = 0; i < array.length; i++) {
                if (i > 0) out.append(',');
                out.append(array[i]);
            }
            out.append(']');
        } else if (value instanceof long[]) {
            long[] array = (long[]) value;
            out.append('[');
            for (int i = 0; i < array.length; i++) {
                if (i > 0) out.append(',');
                out.append(array[i]);
            }
            out.append(']');
        } else if (value instanceof double[]) {
            double[] array = (double[]) value;
            out.append('[');
            for (int i = 0; i < array.length; i++) {
                if (i > 0) out.append(',');
                write(out, array[i]);
            }
            out.append(']');
        } else if (value instanceof Object[]) {
            Object[] array = (Object[]) value;
            out.append('[');
            for (int i = 0; i < array.length; i++) {
                if (i > 0) out.append(',');
                write(out, array[i]);
            }
            out.append(']');
        } else {
            throw new IllegalArgumentException(value.getClass().getName() + " is not valid JSON");
        }
    }

    private static void writeString(StringBuilder out, String text) {
        out.append('"');
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '"' || c == '\\') out.append('\\').append(c);
            else if (c == '\n') out.append("\\n");
            else if (c == '\t') out.append("\\t");
            else if (c == '\r') out.append("\\r");
            else if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
            else out.append(c);
        }
        out.append('"');
    }

    private static final class Parser {
        private final String text;
        private int at;

        Parser(String text) {
            this.text = text;
        }

        private void skip() {
            while (at < text.length() && Character.isWhitespace(text.charAt(at))) at++;
        }

        Object value() {
            skip();
            char c = text.charAt(at);
            if (c == '{') {
                at++;
                Map<String, Object> map = new LinkedHashMap<>();
                skip();
                while (text.charAt(at) != '}') {
                    skip();
                    String key = string();
                    skip();
                    at++; // ':'
                    map.put(key, value());
                    skip();
                    if (text.charAt(at) == ',') at++;
                    skip();
                }
                at++;
                return map;
            }
            if (c == '[') {
                at++;
                List<Object> list = new ArrayList<>();
                skip();
                while (text.charAt(at) != ']') {
                    list.add(value());
                    skip();
                    if (text.charAt(at) == ',') at++;
                    skip();
                }
                at++;
                return list;
            }
            if (c == '"') return string();
            if (text.startsWith("true", at)) { at += 4; return Boolean.TRUE; }
            if (text.startsWith("false", at)) { at += 5; return Boolean.FALSE; }
            if (text.startsWith("null", at)) { at += 4; return null; }
            int start = at;
            while (at < text.length() && "+-0123456789.eE".indexOf(text.charAt(at)) >= 0) at++;
            String number = text.substring(start, at);
            if (number.contains(".") || number.contains("e") || number.contains("E"))
                return Double.parseDouble(number);
            long whole = Long.parseLong(number);
            return whole >= Integer.MIN_VALUE && whole <= Integer.MAX_VALUE ? (Object) (int) whole : (Object) whole;
        }

        private String string() {
            StringBuilder out = new StringBuilder();
            at++;
            while (text.charAt(at) != '"') {
                char c = text.charAt(at++);
                if (c != '\\') { out.append(c); continue; }
                char e = text.charAt(at++);
                switch (e) {
                    case 'n': out.append('\n'); break;
                    case 't': out.append('\t'); break;
                    case 'r': out.append('\r'); break;
                    case 'b': out.append('\b'); break;
                    case 'f': out.append('\f'); break;
                    case 'u':
                        out.append((char) Integer.parseInt(text.substring(at, at + 4), 16));
                        at += 4;
                        break;
                    default: out.append(e);
                }
            }
            at++;
            return out.toString();
        }
    }
}
`;

/** Marks the harness's own lines in stdout, apart from whatever the solution prints. */
export const RESULT_MARK = "\u001eMM:";

export const MAIN_JAVA =
  String.raw`/** Runs the issue's adapter for one case; the arguments are args[0], as JSON. */
public final class MmMain {
    public static void main(String[] args) {
        String result;
        try {
            result = "{\"json\":" + Json.of(Adapter.call(Json.parse(args[0]))).write() + "}";
        } catch (Throwable error) {
            StringBuilder trace = new StringBuilder(error.toString()).append('\n');
            // Without debug information TeaVM names every frame Throwable$FakeClass; skip those.
            for (StackTraceElement frame : error.getStackTrace())
                if (!frame.toString().contains("$FakeClass"))
                    trace.append("\tat ").append(frame).append('\n');
            result = "{\"error\":{\"type\":" + Json.of(error.getClass().getSimpleName()).write()
                + ",\"message\":" + Json.of(String.valueOf(error.getMessage())).write()
                + ",\"traceback\":" + Json.of(trace.toString()).write() + "}}";
        }
        System.out.flush();
        System.out.println("` +
  "\\u001eMM:" +
  String.raw`" + result);
    }
}
`;
