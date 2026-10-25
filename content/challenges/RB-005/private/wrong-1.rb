# Mistake: reverses subtraction
def evaluate(tokens)
  s=[]
  tokens.each { |t| if ["+","-","*"].include?(t); a=s.pop; b=s.pop; s << (t=="+" ? a+b : t=="-" ? a-b : a*b); else; s << t.to_i; end }
  s[0]
end
