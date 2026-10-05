// One registry. The host asks for a name; it does not import each style file.
(function (root) {
  "use strict";
  root.PondStyles = {
    real: {
      name: "real",
      art: root.PondArtReal,
      bed: root.PondBedReal,
      look: root.PondLookReal,
    },
    xieyi: {
      name: "xieyi",
      art: root.PondArtXieyi,
      bed: root.PondBedXieyi,
      look: root.PondLookXieyi,
    },
  };
})(window);
