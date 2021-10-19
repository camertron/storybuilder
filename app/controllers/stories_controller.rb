class StoriesController < ApplicationController
  def new
    @component_manifest = helpers.component_manifest
  end
end