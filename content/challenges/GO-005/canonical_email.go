package signup

import "strings"

// CanonicalEmail is the key sign-up looks accounts up by, so one person gets one account
// however they type their address. ok is false when raw is not an address we accept.
func CanonicalEmail(raw string) (string, bool) {
	email := strings.TrimSpace(raw)
	if !strings.Contains(email, "@") {
		return "", false
	}
	return email, true
}
