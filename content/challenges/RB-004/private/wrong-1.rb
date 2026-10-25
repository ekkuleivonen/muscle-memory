# Mistake: multiplies matching positions only
def multiply(a, b)
  a.zip(b).map { |x,y| x * (y || 0) }
end
