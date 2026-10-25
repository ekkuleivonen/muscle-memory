def group_runs(values)
  values.slice_when { |a,b| b != a + 1 }.to_a
end
