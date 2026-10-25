def evaluate(tokens)
  stack=[]
  tokens.each do |t|
    if ["+","-","*"].include?(t)
      right=stack.pop
      left=stack.pop
      stack << (t=="+" ? left+right : t=="-" ? left-right : left*right)
    else
      stack << t.to_i
    end
  end
  stack[0]
end
