def count_words(text):
    """Count space-separated tokens, overlooking other whitespace."""
    return len([word for word in text.split(" ") if word])
