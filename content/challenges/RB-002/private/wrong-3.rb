# Deletes other scripts and emoji instead of turning them into a hyphen, so "Tokyo日本Team" runs together.
# Workspace URLs are /w/<slug>. Turn a workspace name into its slug:
# lowercase ASCII letters and digits, words joined by single hyphens.
def slugify(name)
  name.unicode_normalize(:nfkd)
      .encode("ASCII", undef: :replace, replace: "")
      .downcase
      .gsub(/[^a-z0-9]+/, "-")
      .gsub(/\A-+|-+\z/, "")
end
