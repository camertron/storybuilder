import $, { Cash } from "cash-dom";
import { getEffectiveConstraintOfTypeParameter, getTextOfJSDocComment } from "typescript";
import { v4 as uuidv4 } from "uuid";

type DefinitionFields = {
  component: string,
  namespace: string,
  source: string,
  parameters: ParamFields[]
};

type ParamFields = {
  name: string,
  type: string,
  default: string,
  description: string
};

class Parameter {
  public name: string;
  public type: string;
  public options: string[];

  constructor(fields: ParamFields) {
    this.name = fields.name;

    // hmm, we should probably do this in ruby on the server side
    if (fields.type == "String" || fields.type == "Symbol") {
      this.type = "String";

      if (fields.description.startsWith("One of")) {
        this.options = [];

        fields.description.slice(6).split(/, |or /).forEach(chunk => {
          const match = chunk.match(/`:?(\w+)`/);
          if (match) {
            this.options.push(match[1]);
          }
        });
      }
    } else {
      this.type = fields.type;
    }
  }
}

export class ComponentMeta {
  public definition: DefinitionFields;
  public parameters: Parameter[];

  public constructor(definition: DefinitionFields) {
    this.definition = definition;
    this.parameters = definition.parameters.map((parameterFields: ParamFields) => {
      return new Parameter(parameterFields);
    });
  }

  public getName(): string {
    return this.definition.component;
  }

  public getParam(name: string): Parameter {
    for (const param of this.parameters) {
      if (param.name == name) {
        return param;
      }
    }

    return null;
  }
}

type Props = {[key: string]: string | boolean};

class ComponentNode {
  public id: string;
  public parent: ComponentNode;
  public meta: ComponentMeta;
  public element: Cash;
  public slots: {[key: string]: Slot};
  public props: Props;

  public constructor(parent: ComponentNode, meta: ComponentMeta, id: string | null = null, props: Props = {}) {
    this.id = id || uuidv4();
    this.parent = parent;
    this.meta = meta;
    this.slots = {};
    this.props = props;

    // ughhh javascript
    this.onClick = this.onClick.bind(this);
  }

  public serialize(): any {
    const slots = {};

    for (const k in this.slots) {
      slots[k] = this.slots[k].serialize();
    }

    return {
      id: this.id,
      component: this.meta.getName(),
      slots: slots,
      props: this.props
    }
  }

  public attachTo(element: Cash) {
    this.element = element;
    this.element.on("click", this.onClick);

    $(".sb-slot-placeholder", this.element).each( (_idx, phElement) => {
      const slotName = $(phElement).data("sb-name");
      this.slots[slotName]?.element?.remove();
      this.slots[slotName] = new Slot(slotName, this);
      this.slots[slotName].attachTo($(phElement));
    });
  }

  public setProps(newProps: Props) {
    this.props = newProps;
    refresh();
  }

  private onClick(e: MouseEvent) {
    e.stopPropagation();

    Settings.get(this.meta).then( (settings: Settings) => {
      settings.manageNode(this);
      $("#sb-settings").replaceWith(settings.element);
    });
  }
}

class Slot {
  public parent: ComponentNode;
  public node: ComponentNode;  // the component rendered in this slot (can be null)
  public name: string;
  public element: Cash;

  public constructor(name: string, parent: ComponentNode, node: ComponentNode = null) {
    this.name = name;
    this.parent = parent;
    this.node = node;

    // I hate javascript
    this.onDragOver = this.onDragOver.bind(this);
    this.onDrop = this.onDrop.bind(this);
    this.onDragEnter = this.onDragEnter.bind(this);
    this.onDragLeave = this.onDragLeave.bind(this);
  }

  public attachTo(element: Cash) {
    this.element = element;

    element.on("dragover", this.onDragOver);
    element.on("drop", this.onDrop);
    element.on("dragenter", this.onDragEnter);
    element.on("dragleave", this.onDragLeave);
  }

  public serialize(): any {
    return this.node?.serialize();
  }

  private onDragOver(e: DragEvent) {
    e.preventDefault();
  }

  private onDragEnter(e: DragEvent) {
    this.element.addClass("highlight");
  }

  private onDragLeave(e: DragEvent) {
    this.element.removeClass("highlight");
  }

  private onDrop(e: DragEvent) {
    e.preventDefault();

    const componentName = e.dataTransfer.getData("component");
    const componentMeta = manifest[componentName];
    const componentNode = new ComponentNode(this.parent, componentMeta, null)
    this.node = componentNode;
    nodes[componentNode.id]?.element.remove();
    nodes[componentNode.id] = componentNode;

    refresh();
  }
}

class Settings {
  public meta: ComponentMeta;
  public element: Cash;

  private textInputTimeoutHandle: NodeJS.Timeout;
  private props: Props;
  private managedNode: ComponentNode;

  private static settingsManifest: {[key: string]: Promise<void | Settings>} = {};

  static async get(meta: ComponentMeta): Promise<void | Settings> {
    const existingSettings = this.settingsManifest[meta.getName()];
    if (existingSettings) {
      return Promise.resolve(existingSettings);
    }

    const requestOptions = {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    };

    const response = await fetch(`/settings/${meta.getName()}`, requestOptions);
    const settings = response.json().then(data => {
      const settings = new Settings(meta);
      const element = $(data.html);
      settings.attachTo(element);
      return settings;
    });

    Settings.settingsManifest[meta.getName()] = settings;
    return settings;
  }

  public constructor(meta: ComponentMeta, defaultProps: Props = {}) {
    this.meta = meta;

    // freaking javascript
    this.onOptionSelect = this.onOptionSelect.bind(this);
    this.onInputChange = this.onInputChange.bind(this);

    this.props = {...defaultProps};
  }

  public attachTo(element: Cash) {
    this.element = element;

    const that = this;

    $(".form-control", this.element).each( (_idx, formControl) => {
      const paramName = $(formControl).data("sb-param");
      const param = that.meta.getParam(paramName);

      if (param.options) {
        $(formControl).on("change", that.onOptionSelect);
      } else {
        $(formControl).on("keyup", that.onInputChange);
      }
    });
  }

  public manageNode(node: ComponentNode) {
    this.managedNode = node;
  }

  private onOptionSelect(e: InputEvent) {
    const paramName = $(e.target as Element).data("sb-param");
    this.props[paramName] = (e.target as HTMLInputElement).value;
    this.onPropsChange();
  }

  private onInputChange(e: InputEvent) {
    if (this.textInputTimeoutHandle) {
      clearTimeout(this.textInputTimeoutHandle);
    }

    this.textInputTimeoutHandle = setTimeout( () => {
      const paramName = $(e.target as Element).data("sb-param");
      this.props[paramName] = (e.target as HTMLInputElement).value;
      this.onPropsChange();
    }, 2000);
  }

  private onPropsChange() {
    this.managedNode.setProps(this.props);
  }
}


const rootMeta = new ComponentMeta({component: "root", namespace: null, source: null, parameters: []});
const root = new ComponentNode(null, rootMeta);
const nodes: {[key: string]: ComponentNode} = { "root": root };
const manifest: {[key: string]: ComponentMeta} = {};

const refresh = () => {
  const requestOptions = {
    method: "PATCH",
    body: JSON.stringify({state: root.serialize()}),
    headers: {
      "Content-Type": "application/json"
    }
  };

  fetch("/components/root", requestOptions).then(response => {
    response.json().then(data => {
      root.element.html(data.html);

      $("[data-view-component=true]", root.element).each( (_idx, element) => {
        const id = $(element).data("sb-id");

        if (id) {
          const node = nodes[id];
          node.element?.remove();
          node.attachTo($(element));
        }
      });
    });
  });
};


$(document).ready( () => {
  root.attachTo($("#sb-main-canvas"));

  fetch("/components").then(componentsResponse => {
    componentsResponse.json().then(componentData => {
      componentData.forEach( (definition: DefinitionFields) => {
        manifest[definition.component] = new ComponentMeta(definition);
      });
    });
  });

  root.element.data("sb-id", root.id);

  // wire up handlers for all the draggable components in the pallette/sidebar
  $(".sb-component").on("dragstart", (e: DragEvent) => {
    e.dataTransfer.setData("component", $(e.target as Element).data("sb-component"));
  });
});
