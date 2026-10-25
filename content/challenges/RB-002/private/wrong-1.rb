# Never strips accents, so accented letters are dropped as separators: "Café" becomes "caf".
# Workspace URLs are /w/<slug>. Turn a workspace name into its slug:
# lowercase ASCII letters and digits, words joined by single hyphens.
def slugify(name)
  name.downcase
      .gsub(/[^a-z0-9]+/, "-")
      .gsub(/\A-+|-+\z/, "")
end
