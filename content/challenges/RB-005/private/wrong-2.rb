# Mistake: only adds numbers
def evaluate(tokens)
  tokens.sum(&:to_i)
end
