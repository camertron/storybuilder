class SettingsController < ApplicationController
  def show
    meta = helpers.component_manifest.find do |meta|
      meta["component"] == params["component"]
    end

    controls = meta["parameters"].map do |parameter|
      case parameter["type"]
        when "Symbol", "String"
          if (options = parameter["options"])
            options_html = options.map do |option|
              "<option value='#{option}'>#{option}</option>"
            end

            <<~HTML
              <label for='#{parameter["name"]}'>#{parameter["name"]}</label>
              <select class="form-control" data-sb-param='#{parameter["name"]}'>
                #{options_html.join("\n")}
              </select>
            HTML
          else
            <<~HTML
              <label for='#{parameter["name"]}'>#{parameter["name"]}</label>
              <input class="form-control" data-sb-param='#{parameter["name"]}' type="text" />
            HTML
          end
      end
    end

    html = <<~HTML.html_safe
      <form>
        #{controls.compact.join("\n")}
      </form>
    HTML

    respond_to do |format|
      format.json { render json: { html: html } }
    end
  end
end