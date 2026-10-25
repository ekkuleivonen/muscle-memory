def multiply(a, b)
  (0...(a.length+b.length-1)).map { |k| (0...a.length).sum { |i| j=k-i; j>=0 && j<b.length ? a[i]*b[j] : 0 } }
end
