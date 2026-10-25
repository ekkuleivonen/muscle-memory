# \w+ counts only letters, digits and underscores: punctuation splits words and lone symbols vanish.
# The number of words in a post, as the composer shows it under the text box.
def count_words(text)
  text.scan(/\w+/).size
end
