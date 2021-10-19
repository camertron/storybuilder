require "json"
require "securerandom"

class ComponentsController < ApplicationController
  skip_before_action :verify_authenticity_token, only: [:update]

  def index
    respond_to do |format|
      format.json { render json: helpers.component_manifest.to_json }
    end
  end

  def update
    state = JSON.parse(request.body.read).dig(*%w(state slots main))

    respond_to do |format|
      format.json { render json: { html: render_state(state) } }
    end
  end

  def render_state(state)
    component_name = state["component"]
    slots = state["slots"]
    component_meta = helpers.component_manifest.find { |c| c["component"] == component_name }
    component_klass = Kernel.const_get(component_meta["ruby_class"])
    props = coerce_props(state["props"], component_meta)

    view_context.render(component_klass.new(**{ **props, data: { "sb-id": state["id"], "sb-component": component_name } })) do |component|
      component_meta["slots"].each do |slot_name, slot_meta|
        # Only add placeholders to slots that can accept arbitrary content, i.e. that are lambda slots
        next unless slot_meta[:lambda]

        if slot = slots[slot_name.to_s]
          component.send(slot_name, classes: "").with_content(
            render_state(slot)
          )
        else
          component.send(slot_name, classes: "").with_content(
            <<~HTML.html_safe
              <div class="sb-slot-placeholder" data-sb-name="#{slot_name}">
                #{slot_name}
              </div>
            HTML
          )
        end
      end

      if component_name == "Button"
        "Click me!"
      end
    end
  end

  def coerce_props(props, component_meta)
    props.each_with_object({}) do |(prop_name, prop_value), memo|
      param = component_meta["parameters"].find { |param| param["name"] == prop_name }
      types = param["type"].split(",").map { |t| Kernel.const_get(t) }

      if types.any? { |t| prop_value.is_a?(t) }
        memo[prop_name.to_sym] = prop_value
      else
        memo[prop_name.to_sym] = if types.first == String
          prop_value.to_s
        elsif types.first == Symbol
          prop_value.to_sym
        else
          prop_value
        end
      end
    end
  end
end
