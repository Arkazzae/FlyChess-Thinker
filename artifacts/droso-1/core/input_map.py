"""A shared artificial board interface with complete coverage of all 64 squares.

The legacy rectangular scaling of the oblique eye-column lattice leaves fourteen
board squares unseen. Partition measured columns into eight spatial bands, then
eight spatial groups per band. This is a model interface, not measured retinotopy.
"""
import numpy as np


def complete_square_map(hex1, hex2):
    coordinates = np.column_stack((hex1, hex2))
    if (coordinates < 0).any():
        raise ValueError('only measured visual columns can be mapped')
    columns, inverse = np.unique(coordinates, axis=0, return_inverse=True)
    if len(columns) < 64:
        raise ValueError('at least 64 measured columns required')
    ordered = np.lexsort((columns[:, 0], columns[:, 1]))
    square = np.empty(len(columns), np.int64)
    for rank, band in enumerate(np.array_split(ordered, 8)):
        band = band[np.lexsort((columns[band, 1], columns[band, 0]))]
        for file, group in enumerate(np.array_split(band, 8)):
            square[group] = rank * 8 + file
    result = square[inverse]
    if len(np.unique(result)) != 64:
        raise ValueError('incomplete board coverage')
    return result
