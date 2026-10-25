package signup

import (
	"strings"
	"unicode"
)

// CanonicalEmail is the key sign-up looks accounts up by, so one person gets one account
// however they type their address. ok is false when raw is not an address we accept.
func CanonicalEmail(raw string) (string, bool) {
	email := strings.ToLower(strings.TrimSpace(raw))
	if strings.IndexFunc(email, unicode.IsSpace) >= 0 || strings.Count(email, "@") != 1 {
		return "", false
	}
	at := strings.Index(email, "@")
	local, domain := email[:at], email[at+1:]
	if domain == "gmail.com" || domain == "googlemail.com" {
		// Gmail ignores dots and everything after a plus: all of these reach one inbox.
		if plus := strings.Index(local, "+"); plus >= 0 {
			local = local[:plus]
		}
		local = strings.ReplaceAll(local, ".", "")
		domain = "gmail.com"
	}
	if local == "" || domain == "" {
		return "", false
	}
	return local + "@" + domain, true
}
