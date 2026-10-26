# TODO: implement the task.
def group_runs(values)
  runs = []
  values.each do |value|
    if runs.empty? || value > runs[-1][-1] + 2
      runs << [value]
    else
      runs[-1] << value
    end
  end
  runs
end
