/**
 * The C side of the C/C++ runner (valid C and C++, compiled as the program's language): a small JSON library the challenge's adapter uses to turn a
 * case's arguments into C or C++ values and the result back into JSON, and the program's
 * main. Compiled with every run, next to the solution and the adapter; the main reads the
 * case from stdin and writes the result to /result.json, so stdout stays the program's own.
 */
export const MM_JSON_H = String.raw`#ifndef MM_JSON_H
#define MM_JSON_H
#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef enum { MM_NULL, MM_BOOL, MM_NUMBER, MM_STRING, MM_ARRAY, MM_OBJECT } mm_kind;
typedef struct mm_value mm_value;

/* Reading a case's arguments. */
mm_kind mm_kind_of(const mm_value *value);
size_t mm_length(const mm_value *value);
mm_value *mm_at(const mm_value *array, size_t index);
mm_value *mm_get(const mm_value *object, const char *key);
double mm_number(const mm_value *value);
long long mm_integer(const mm_value *value);
bool mm_bool(const mm_value *value);
const char *mm_string(const mm_value *value);

/* Building the result. */
mm_value *mm_new_null(void);
mm_value *mm_new_bool(bool value);
mm_value *mm_new_number(double value);
mm_value *mm_new_integer(long long value);
mm_value *mm_new_string(const char *text);
mm_value *mm_new_array(void);
mm_value *mm_new_object(void);
void mm_push(mm_value *array, mm_value *item);
void mm_set(mm_value *object, const char *key, mm_value *item);

mm_value *mm_parse(const char *text);
void mm_write(FILE *out, const mm_value *value);

/* The challenge's adapter defines this: the arguments arrive as a JSON array. */
mm_value *mm_call(const mm_value *args);

#ifdef __cplusplus
}
#endif
#endif
`;

export const MM_JSON_C = String.raw`#include "mm_json.h"
#include <math.h>
#include <stdlib.h>
#include <string.h>

struct mm_value {
  mm_kind kind;
  bool boolean;
  double number;
  char *text;
  mm_value **items;
  char **keys;
  size_t length, capacity;
};

static mm_value *make(mm_kind kind) {
  mm_value *value = (mm_value *)calloc(1, sizeof(mm_value));
  value->kind = kind;
  return value;
}

mm_kind mm_kind_of(const mm_value *value) { return value ? value->kind : MM_NULL; }
size_t mm_length(const mm_value *value) {
  return value && (value->kind == MM_ARRAY || value->kind == MM_OBJECT) ? value->length : 0;
}
mm_value *mm_at(const mm_value *array, size_t index) {
  return array && index < mm_length(array) ? array->items[index] : NULL;
}
mm_value *mm_get(const mm_value *object, const char *key) {
  if (!object || object->kind != MM_OBJECT) return NULL;
  for (size_t i = 0; i < object->length; i++)
    if (strcmp(object->keys[i], key) == 0) return object->items[i];
  return NULL;
}
double mm_number(const mm_value *value) { return value && value->kind == MM_NUMBER ? value->number : 0; }
long long mm_integer(const mm_value *value) { return (long long)mm_number(value); }
bool mm_bool(const mm_value *value) { return value && value->kind == MM_BOOL && value->boolean; }
const char *mm_string(const mm_value *value) {
  return value && value->kind == MM_STRING ? value->text : "";
}

mm_value *mm_new_null(void) { return make(MM_NULL); }
mm_value *mm_new_bool(bool flag) { mm_value *v = make(MM_BOOL); v->boolean = flag; return v; }
mm_value *mm_new_number(double n) { mm_value *v = make(MM_NUMBER); v->number = n; return v; }
mm_value *mm_new_integer(long long n) { return mm_new_number((double)n); }
mm_value *mm_new_string(const char *text) {
  mm_value *v = make(MM_STRING);
  v->text = strdup(text ? text : "");
  return v;
}
mm_value *mm_new_array(void) { return make(MM_ARRAY); }
mm_value *mm_new_object(void) { return make(MM_OBJECT); }

static void grow(mm_value *value) {
  if (value->length < value->capacity) return;
  value->capacity = value->capacity ? value->capacity * 2 : 8;
  value->items = (mm_value **)realloc(value->items, value->capacity * sizeof(mm_value *));
  if (value->kind == MM_OBJECT)
    value->keys = (char **)realloc(value->keys, value->capacity * sizeof(char *));
}
void mm_push(mm_value *array, mm_value *item) {
  grow(array);
  array->items[array->length++] = item;
}
void mm_set(mm_value *object, const char *key, mm_value *item) {
  grow(object);
  object->keys[object->length] = strdup(key);
  object->items[object->length++] = item;
}

/* Parsing: the cases come from the challenge, so this trusts their shape. */
static const char *skip(const char *p) {
  while (*p == ' ' || *p == '\n' || *p == '\r' || *p == '\t') p++;
  return p;
}
/* Four hex digits; written for both C and C++, which share this file. */
static unsigned hex4(const char *p) {
  char digits[5] = {p[0], p[1], p[2], p[3], 0};
  return (unsigned)strtoul(digits, NULL, 16);
}
static void put_utf8(char **out, unsigned code) {
  char *o = *out;
  if (code < 0x80) *o++ = (char)code;
  else if (code < 0x800) { *o++ = (char)(0xC0 | (code >> 6)); *o++ = (char)(0x80 | (code & 0x3F)); }
  else if (code < 0x10000) {
    *o++ = (char)(0xE0 | (code >> 12)); *o++ = (char)(0x80 | ((code >> 6) & 0x3F));
    *o++ = (char)(0x80 | (code & 0x3F));
  } else {
    *o++ = (char)(0xF0 | (code >> 18)); *o++ = (char)(0x80 | ((code >> 12) & 0x3F));
    *o++ = (char)(0x80 | ((code >> 6) & 0x3F)); *o++ = (char)(0x80 | (code & 0x3F));
  }
  *out = o;
}
static const char *parse_string(const char *p, char **result) {
  char *out = (char *)malloc(strlen(p) * 4 + 1), *o = out;
  p++;
  while (*p && *p != '"') {
    if (*p != '\\') { *o++ = *p++; continue; }
    p++;
    switch (*p) {
      case 'n': *o++ = '\n'; break;
      case 't': *o++ = '\t'; break;
      case 'r': *o++ = '\r'; break;
      case 'b': *o++ = '\b'; break;
      case 'f': *o++ = '\f'; break;
      case 'u': {
        unsigned code = hex4(p + 1);
        p += 4;
        if (code >= 0xD800 && code < 0xDC00 && p[1] == '\\' && p[2] == 'u') {
          unsigned low = hex4(p + 3);
          code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00);
          p += 6;
        }
        put_utf8(&o, code);
        break;
      }
      default: *o++ = *p;
    }
    p++;
  }
  *o = 0;
  *result = out;
  return *p ? p + 1 : p;
}
static const char *parse_value(const char *p, mm_value **result) {
  p = skip(p);
  if (*p == '{') {
    mm_value *object = mm_new_object();
    p = skip(p + 1);
    while (*p && *p != '}') {
      char *key;
      p = parse_string(skip(p), &key);
      p = skip(p);
      if (*p == ':') p++;
      mm_value *item;
      p = parse_value(p, &item);
      mm_set(object, key, item);
      free(key);
      p = skip(p);
      if (*p == ',') p = skip(p + 1);
    }
    *result = object;
    return *p ? p + 1 : p;
  }
  if (*p == '[') {
    mm_value *array = mm_new_array();
    p = skip(p + 1);
    while (*p && *p != ']') {
      mm_value *item;
      p = parse_value(p, &item);
      mm_push(array, item);
      p = skip(p);
      if (*p == ',') p = skip(p + 1);
    }
    *result = array;
    return *p ? p + 1 : p;
  }
  if (*p == '"') {
    mm_value *string = make(MM_STRING);
    p = parse_string(p, &string->text);
    *result = string;
    return p;
  }
  if (strncmp(p, "true", 4) == 0) { *result = mm_new_bool(true); return p + 4; }
  if (strncmp(p, "false", 5) == 0) { *result = mm_new_bool(false); return p + 5; }
  if (strncmp(p, "null", 4) == 0) { *result = mm_new_null(); return p + 4; }
  char *end;
  double number = strtod(p, &end);
  *result = mm_new_number(number);
  return end;
}
mm_value *mm_parse(const char *text) {
  mm_value *value;
  parse_value(text, &value);
  return value;
}

static void write_string(FILE *out, const char *text) {
  fputc('"', out);
  for (const unsigned char *c = (const unsigned char *)text; *c; c++) {
    if (*c == '"' || *c == '\\') { fputc('\\', out); fputc(*c, out); }
    else if (*c == '\n') fputs("\\n", out);
    else if (*c == '\t') fputs("\\t", out);
    else if (*c == '\r') fputs("\\r", out);
    else if (*c < 0x20) fprintf(out, "\\u%04x", *c);
    else fputc(*c, out);
  }
  fputc('"', out);
}
void mm_write(FILE *out, const mm_value *value) {
  switch (mm_kind_of(value)) {
    case MM_NULL: fputs("null", out); break;
    case MM_BOOL: fputs(value->boolean ? "true" : "false", out); break;
    case MM_NUMBER:
      if (!isfinite(value->number)) fputs("null", out);
      else if (value->number == floor(value->number) && fabs(value->number) < 9007199254740992.0)
        fprintf(out, "%lld", (long long)value->number);
      else fprintf(out, "%.17g", value->number);
      break;
    case MM_STRING: write_string(out, value->text); break;
    case MM_ARRAY:
      fputc('[', out);
      for (size_t i = 0; i < value->length; i++) {
        if (i) fputc(',', out);
        mm_write(out, value->items[i]);
      }
      fputc(']', out);
      break;
    case MM_OBJECT:
      fputc('{', out);
      for (size_t i = 0; i < value->length; i++) {
        if (i) fputc(',', out);
        write_string(out, value->keys[i]);
        fputc(':', out);
        mm_write(out, value->items[i]);
      }
      fputc('}', out);
      break;
  }
}
`;

export const MM_MAIN_C = String.raw`#include "mm_json.h"
#include <stdlib.h>

/* One case per run: arguments on stdin, the result in /result.json. */
int main(void) {
  size_t size = 0, capacity = 4096;
  char *input = (char *)malloc(capacity);
  size_t got;
  while ((got = fread(input + size, 1, capacity - size - 1, stdin)) > 0) {
    size += got;
    if (capacity - size < 2) input = (char *)realloc(input, capacity *= 2);
  }
  input[size] = 0;
  mm_value *result = mm_call(mm_parse(input));
  fflush(stdout);
  FILE *out = fopen("/result.json", "w");
  mm_write(out, result);
  fclose(out);
  return 0;
}
`;
