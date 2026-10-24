//go:build js && wasm

// The Go runner's harness: Yaegi, the Go interpreter, compiled to WebAssembly with a single
// entry point the sandbox's worker calls. It evaluates the solution's package, looks up the
// entry point and calls it once per case, decoding each JSON input into the function's
// parameter types and encoding what it returns. Two-value returns follow Go's idioms: an
// error that is not nil, or an ok that is false, is reported as null.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"go/scanner"
	"reflect"
	"regexp"
	"strings"
	"syscall/js"

	"github.com/traefik/yaegi/interp"
	"github.com/traefik/yaegi/stdlib"
)

type codeError struct {
	Type      string `json:"type"`
	Message   string `json:"message"`
	Traceback string `json:"traceback"`
}

type testResult struct {
	Index          int        `json:"index"`
	JSON           *string    `json:"json,omitempty"`
	Repr           string     `json:"repr,omitempty"`
	Unserializable string     `json:"unserializable,omitempty"`
	Error          *codeError `json:"error,omitempty"`
}

type result struct {
	Phase string       `json:"phase"`
	Error *codeError   `json:"error,omitempty"`
	Tests []testResult `json:"tests"`
}

type request struct {
	Code       string            `json:"code"`
	File       string            `json:"file"`
	Entrypoint string            `json:"entrypoint"`
	Inputs     []json.RawMessage `json:"inputs"`
	Spread     bool              `json:"spread"`
}

var packageClause = regexp.MustCompile(`(?m)^\s*package\s+(\w+)`)

var position = regexp.MustCompile(`(?m)^(?:_\.go:)?(\d+:\d+)`)

// located puts the solution's file name on Yaegi's "line:column" positions.
func located(text, file string) string {
	return position.ReplaceAllString(strings.ReplaceAll(text, "_.go:", ""), file+":$1")
}

func errorOf(kind string, err error, file string) *codeError {
	text := located(err.Error(), file)
	return &codeError{Type: kind, Message: text, Traceback: text + "\n"}
}

// panicOf reports a panic with the positions Yaegi printed while unwinding it.
func panicOf(value any, file string, unwound string) *codeError {
	message := fmt.Sprint(value)
	trace := "panic: " + message + "\n"
	for _, line := range strings.Split(strings.TrimSpace(unwound), "\n") {
		if line = strings.TrimSpace(line); line != "" {
			trace += "\t" + located(line, file) + "\n"
		}
	}
	return &codeError{Type: "panic", Message: message, Traceback: trace}
}

// value turns a function's results into the one value a case checks.
func value(out []reflect.Value) (any, *codeError) {
	switch len(out) {
	case 0:
		return nil, nil
	case 1:
		return out[0].Interface(), nil
	case 2:
		last := out[1]
		if last.Kind() == reflect.Bool {
			if !last.Bool() {
				return nil, nil
			}
			return out[0].Interface(), nil
		}
		if last.Type().Implements(reflect.TypeOf((*error)(nil)).Elem()) {
			if !last.IsNil() {
				return nil, nil
			}
			return out[0].Interface(), nil
		}
	}
	values := make([]any, len(out))
	for i, v := range out {
		values[i] = v.Interface()
	}
	return values, nil
}

func call(fn reflect.Value, input json.RawMessage, spread bool, file string, stderr *bytes.Buffer) (out any, failure *codeError) {
	t := fn.Type()
	var raw []json.RawMessage
	if spread {
		if err := json.Unmarshal(input, &raw); err != nil {
			panic(fmt.Errorf("case is not a list of arguments: %w", err))
		}
	} else {
		raw = []json.RawMessage{input}
	}
	if len(raw) != t.NumIn() {
		return nil, &codeError{Type: "TypeError", Message: fmt.Sprintf("%s takes %d arguments; the case has %d.", t, t.NumIn(), len(raw))}
	}
	args := make([]reflect.Value, len(raw))
	for i, item := range raw {
		arg := reflect.New(t.In(i))
		if err := json.Unmarshal(item, arg.Interface()); err != nil {
			return nil, &codeError{Type: "TypeError", Message: fmt.Sprintf("argument %d does not fit %s: %v", i+1, t.In(i), err)}
		}
		args[i] = arg.Elem()
	}
	stderr.Reset()
	defer func() {
		if recovered := recover(); recovered != nil {
			out, failure = nil, panicOf(recovered, file, stderr.String())
		}
	}()
	return value(fn.Call(args))
}

func run(req request) result {
	// Yaegi writes where a panic went through to Stderr; it becomes the panic's trace.
	var stderr bytes.Buffer
	i := interp.New(interp.Options{GoPath: "/go", Stderr: &stderr})
	if err := i.Use(stdlib.Symbols); err != nil {
		panic(err)
	}
	if _, err := i.Eval(req.Code); err != nil {
		var list scanner.ErrorList
		if errors.As(err, &list) || strings.Contains(err.Error(), "expected") {
			return result{Phase: "compile", Error: errorOf("SyntaxError", err, req.File), Tests: []testResult{}}
		}
		return result{Phase: "compile", Error: errorOf("CompileError", err, req.File), Tests: []testResult{}}
	}
	name := req.Entrypoint
	if match := packageClause.FindStringSubmatch(req.Code); match != nil && match[1] != "main" {
		name = match[1] + "." + req.Entrypoint
	}
	fnValue, err := i.Eval(name)
	if err != nil || fnValue.Kind() != reflect.Func {
		return result{Phase: "execute", Tests: []testResult{}, Error: &codeError{
			Type: "NameError", Message: "Define a function named " + req.Entrypoint + ".",
		}}
	}
	tests := make([]testResult, 0, len(req.Inputs))
	for index, input := range req.Inputs {
		out, failure := call(fnValue, input, req.Spread, req.File, &stderr)
		if failure != nil {
			tests = append(tests, testResult{Index: index, Error: failure})
			continue
		}
		repr := fmt.Sprintf("%+v", out)
		if len(repr) > 2000 {
			repr = repr[:2000]
		}
		encoded, err := json.Marshal(out)
		if err != nil {
			tests = append(tests, testResult{Index: index, Repr: repr, Unserializable: err.Error()})
			continue
		}
		text := string(encoded)
		tests = append(tests, testResult{Index: index, JSON: &text, Repr: repr})
	}
	return result{Phase: "tests", Tests: tests}
}

// main registers __mmGoRun, which returns a Promise: the run happens on a goroutine, so
// solutions may block (time.Sleep, channels, net/http) without deadlocking the JS caller.
func main() {
	js.Global().Set("__mmGoRun", js.FuncOf(func(this js.Value, args []js.Value) any {
		payload := args[0].String()
		return js.Global().Get("Promise").New(js.FuncOf(func(_ js.Value, settle []js.Value) any {
			resolve := settle[0]
			go func() {
				var req request
				if err := json.Unmarshal([]byte(payload), &req); err != nil {
					resolve.Invoke(`{"phase":"execute","tests":[],"error":{"type":"HarnessError","message":"bad request"}}`)
					return
				}
				out, _ := json.Marshal(run(req))
				resolve.Invoke(string(out))
			}()
			return nil
		}))
	}))
	select {}
}
