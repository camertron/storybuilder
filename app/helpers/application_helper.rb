module ApplicationHelper
  def component_manifest
    @component_manifest ||= begin
      pvc_path = Gem.loaded_specs['primer_view_components'].full_gem_path
      arg_path = File.join(pvc_path, 'static', 'arguments.yml')
      entries = YAML.load_file(arg_path)

      entries.each do |entry|
        klass = Kernel.const_get(entry["ruby_class"]) rescue nil
        next unless klass

        entry["slots"] = klass.registered_slots.each_with_object({}) do |(slot_name, slot_params), memo|
          memo[slot_name] = slot_params.dup.tap do |new_slot_params|
            if new_slot_params.include?(:renderable_function)
              new_slot_params.delete(:renderable_function)
              new_slot_params[:lambda] = true
            end
          end
        end

        entry["parameters"].map! do |fields|
          options = if fields["type"] == "String" || fields["type"] == "Symbol"
            if fields["description"].start_with?("One of")
              fields["description"][6..-1].split(/, |or /).each_with_object([]) do |chunk, ret|
                if (match = chunk.match(/`:?(\w+)`/))
                  ret << match.captures[0]
                end
              end
            end
          end

          { **fields, "options" => options }
        end
      end
    end
  end
end
