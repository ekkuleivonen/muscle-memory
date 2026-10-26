# TODO: implement the task.
def evaluate(tokens)
  stack = []
  tokens.each do |token|
    if ["+", "-", "*"].include?(token)
      right = stack.pop
      left = stack.pop
      case token
      when "+" then stack << left + right
      when "-" then stack << left - right
      when "*" then stack << left * right
      end
    else
      stack << token.to_i
    end
  end
  stack[-1]
end
