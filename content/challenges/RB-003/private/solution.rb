def group_runs(values)
  out = []
  values.each do |v|
    if out.empty? || v != out[-1][-1] + 1
      out << [v]
    else
      out[-1] << v
    end
  end
  out
end
