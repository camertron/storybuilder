Rails.application.routes.draw do
  # For details on the DSL available within this file, see https://guides.rubyonrails.org/routing.html

  resources :stories, only: [:new]
  resources :components, only: [:index, :update]
  resources :settings, only: [:show], param: :component
end
