# TODO: implement the task.
def multiply(a, b)
  result = Array.new(a.length + b.length - 1, 0)
  a.each_with_index do |left, i|
    b.each_with_index do |right, j|
      result[i + j] += left * right
    end
  end
  result.pop while result.length > 1 && result[-1] == 0
  result
end
