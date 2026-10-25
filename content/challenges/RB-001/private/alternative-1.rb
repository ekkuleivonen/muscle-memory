# The number of words in a post, as the composer shows it under the text box.
def count_words(text)
  text.scan(/\S+/).size
end
