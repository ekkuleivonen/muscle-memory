def count_words(text):
    """The number of words in a post, as the composer shows it under the text box."""
    return len([word for word in text.replace("\t", " ").replace("\r", " ").replace("\n", " ").split(" ") if word])
