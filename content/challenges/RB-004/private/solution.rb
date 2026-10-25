def multiply(a, b)
  out = Array.new(a.length + b.length - 1, 0)
  a.each_with_index { |x,i| b.each_with_index { |y,j| out[i+j] += x*y } }
  out
end
