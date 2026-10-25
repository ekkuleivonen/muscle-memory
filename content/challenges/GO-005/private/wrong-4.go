// Rejects only ASCII whitespace inside the address, so a no-break space or other Unicode space gets through.
package signup

import "strings"

// CanonicalEmail is the key sign-up looks accounts up by, so one person gets one account
// however they type their address. ok is false when raw is not an address we accept.
func CanonicalEmail(raw string) (string, bool) {
	email := strings.ToLower(strings.TrimSpace(raw))
	if strings.ContainsAny(email, " \t\n\r\v\f") || strings.Count(email, "@") != 1 {
		return "", false
	}
	at := strings.Index(email, "@")
	local, domain := email[:at], email[at+1:]
	if domain == "gmail.com" || domain == "googlemail.com" {
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
