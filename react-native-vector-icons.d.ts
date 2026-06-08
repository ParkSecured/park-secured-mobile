declare module 'react-native-vector-icons/Ionicons' {
  import { Component } from 'react';
  import { TextStyle } from 'react-native';
  interface IconProps {
    name: string;
    size?: number;
    color?: string;
    style?: TextStyle;
  }
  export default class Ionicons extends Component<IconProps> {}
}

declare module 'react-native-vector-icons/MaterialIcons' {
  import { Component } from 'react';
  import { TextStyle } from 'react-native';
  interface IconProps {
    name: string;
    size?: number;
    color?: string;
    style?: TextStyle;
  }
  export default class MaterialIcons extends Component<IconProps> {}
}

declare module 'react-native-vector-icons/MaterialCommunityIcons' {
  import { Component } from 'react';
  import { TextStyle } from 'react-native';
  interface IconProps {
    name: string;
    size?: number;
    color?: string;
    style?: TextStyle;
  }
  export default class MaterialCommunityIcons extends Component<IconProps> {}
}
