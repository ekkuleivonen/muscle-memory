def evaluate(tokens)
  work=tokens.dup
  while work.length>1
    i=work.index { |t| ["+","-","*"].include?(t) }
    a=work[i-2].to_i; b=work[i-1].to_i; op=work[i]
    work[(i-2)..i]=[(op=="+" ? a+b : op=="-" ? a-b : a*b).to_s]
  end
  work[0].to_i
end
